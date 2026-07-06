import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { KudosService } from '../src/modules/kudos/kudos.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { cleanupUsers, createTestApp, createTestUsers } from './test-helpers';

describe('Give Kudo (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let kudosService: KudosService;
  let sender: { id: string; email: string };
  let receiver: { id: string; email: string };
  let token: string;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    kudosService = app.get(KudosService);
    const tag = Date.now().toString(36);
    [sender, receiver] = await createTestUsers(prisma, tag, [
      'gk-sender',
      'gk-receiver',
    ]);
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: sender.email })
      .expect(200);
    token = login.body.accessToken;
  });

  afterAll(async () => {
    await cleanupUsers(prisma, [sender.id, receiver.id]);
    await app.close();
  });

  it('integration: POST /kudos persists kudo, budget and ledger consistently', async () => {
    const res = await request(app.getHttpServer())
      .post('/kudos')
      .set('Authorization', `Bearer ${token}`)
      .send({
        receiverId: receiver.id,
        points: 25,
        description: 'e2e: shipped the release',
        coreValue: '#Ownership',
      })
      .expect(201);

    // kudo persisted
    const kudo = await prisma.kudo.findUnique({ where: { id: res.body.id } });
    expect(kudo).toMatchObject({
      senderId: sender.id,
      receiverId: receiver.id,
      points: 25,
    });

    // sender budget charged
    const budget = await prisma.givingBudget.findFirst({
      where: { userId: sender.id },
    });
    expect(budget?.spent).toBe(25);

    // receiver ledger credited (source of truth for balance)
    const ledger = await prisma.pointLedger.findFirst({
      where: { referenceId: kudo!.id },
    });
    expect(ledger).toMatchObject({
      userId: receiver.id,
      delta: 25,
      type: 'KUDO_RECEIVED',
    });
  });

  it('rejects giving kudos to yourself', async () => {
    await request(app.getHttpServer())
      .post('/kudos')
      .set('Authorization', `Bearer ${token}`)
      .send({
        receiverId: sender.id,
        points: 10,
        description: 'e2e: self five',
        coreValue: '#Teamwork',
      })
      .expect(400);
  });

  it('rejects out-of-range points (DTO validation)', async () => {
    for (const points of [5, 55, 20.5]) {
      await request(app.getHttpServer())
        .post('/kudos')
        .set('Authorization', `Bearer ${token}`)
        .send({
          receiverId: receiver.id,
          points,
          description: 'e2e: bad points',
          coreValue: '#Teamwork',
        })
        .expect(400);
    }
  });

  it('resets the giving budget each month (fresh row per yearMonth)', async () => {
    // exhaust LAST month's budget entirely…
    await prisma.givingBudget.create({
      data: { userId: sender.id, yearMonth: '2026-06', spent: 200 },
    });
    // …giving THIS month must still work: a new row starts at spent=0
    const kudo = await kudosService.giveKudo(sender.id, {
      receiverId: receiver.id,
      points: 50,
      description: 'e2e: new month, fresh budget',
      coreValue: '#Teamwork',
    });
    expect(kudo.id).toBeDefined();

    const rows = await prisma.givingBudget.findMany({
      where: { userId: sender.id },
      orderBy: { yearMonth: 'asc' },
    });
    // old month untouched, current month only charged for its own kudos
    expect(rows.find((r) => r.yearMonth === '2026-06')?.spent).toBe(200);
    const current = rows.find((r) => r.yearMonth !== '2026-06');
    expect(current?.spent).toBeLessThanOrEqual(200);
  });

  it('deleting a kudo refunds the budget and reverses the ledger (audit-safe)', async () => {
    const kudo = await kudosService.giveKudo(sender.id, {
      receiverId: receiver.id,
      points: 30,
      description: 'e2e: to be deleted',
      coreValue: '#Teamwork',
    });
    const spentBefore = (await prisma.givingBudget.findFirst({
      where: { userId: sender.id, yearMonth: { not: '2026-06' } },
    }))!.spent;

    await request(app.getHttpServer())
      .delete(`/kudos/${kudo.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    // budget refunded
    const spentAfter = (await prisma.givingBudget.findFirst({
      where: { userId: sender.id, yearMonth: { not: '2026-06' } },
    }))!.spent;
    expect(spentAfter).toBe(spentBefore - 30);

    // original ledger entry KEPT + reversal appended (append-only audit)
    const entries = await prisma.pointLedger.findMany({
      where: { referenceId: kudo.id },
      orderBy: { createdAt: 'asc' },
    });
    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({ delta: 30, type: 'KUDO_RECEIVED' });
    expect(entries[1]).toMatchObject({ delta: -30, type: 'KUDO_REVOKED' });
  });

  it('only the sender can delete a kudo', async () => {
    const kudo = await kudosService.giveKudo(sender.id, {
      receiverId: receiver.id,
      points: 10,
      description: 'e2e: not yours',
      coreValue: '#Teamwork',
    });
    const receiverLogin = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: receiver.email })
      .expect(200);
    await request(app.getHttpServer())
      .delete(`/kudos/${kudo.id}`)
      .set('Authorization', `Bearer ${receiverLogin.body.accessToken}`)
      .expect(403);

    // clean up as the sender so later budget assertions stay deterministic
    await request(app.getHttpServer())
      .delete(`/kudos/${kudo.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
  });

  it('concurrent gives never exceed the 200-point monthly budget', async () => {
    // budget left: 200 - 25 - 50 = 125 -> only 3 of 6 x 40 can fit
    const results = await Promise.allSettled(
      Array.from({ length: 6 }, () =>
        kudosService.giveKudo(sender.id, {
          receiverId: receiver.id,
          points: 40,
          description: 'e2e: concurrent burst',
          coreValue: '#Teamwork',
        }),
      ),
    );
    const fulfilled = results.filter((r) => r.status === 'fulfilled').length;
    expect(fulfilled).toBe(3);

    const budget = await prisma.givingBudget.findFirst({
      where: { userId: sender.id, yearMonth: { not: '2026-06' } },
    });
    expect(budget!.spent).toBeLessThanOrEqual(200);
    expect(budget!.spent).toBe(25 + 50 + 3 * 40); // = 195
  });
});
