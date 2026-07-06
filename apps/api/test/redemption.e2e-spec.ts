import { INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import * as request from 'supertest';
import { RewardsService } from '../src/modules/rewards/rewards.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { cleanupUsers, createTestApp, createTestUsers } from './test-helpers';

describe('Redemption (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let rewardsService: RewardsService;
  let user: { id: string; email: string };
  let token: string;
  let rewardId: string;

  const topUp = (userId: string, delta: number) =>
    prisma.pointLedger.create({
      data: { userId, delta, type: 'KUDO_RECEIVED', referenceId: 'e2e-topup' },
    });

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    rewardsService = app.get(RewardsService);
    const tag = Date.now().toString(36);
    [user] = await createTestUsers(prisma, tag, ['rd-user']);
    const reward = await prisma.reward.create({
      data: { name: `e2e-reward-${tag}`, cost: 100 },
    });
    rewardId = reward.id;
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: user.email })
      .expect(200);
    token = login.body.accessToken;
  });

  afterAll(async () => {
    await cleanupUsers(prisma, [user.id]);
    await prisma.reward.delete({ where: { id: rewardId } });
    await app.close();
  });

  it('blocks redeeming more than the current balance', async () => {
    // balance is 0 — reward costs 100
    await request(app.getHttpServer())
      .post(`/rewards/${rewardId}/redeem`)
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', randomUUID())
      .expect(400);
  });

  it('requires the Idempotency-Key header', async () => {
    await request(app.getHttpServer())
      .post(`/rewards/${rewardId}/redeem`)
      .set('Authorization', `Bearer ${token}`)
      .expect(400);
  });

  it('redeems successfully and writes a negative ledger entry', async () => {
    await topUp(user.id, 100);
    const res = await request(app.getHttpServer())
      .post(`/rewards/${rewardId}/redeem`)
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', randomUUID())
      .expect(201);

    const ledger = await prisma.pointLedger.findFirst({
      where: { referenceId: res.body.id },
    });
    expect(ledger).toMatchObject({ delta: -100, type: 'REDEMPTION' });

    const sum = await prisma.pointLedger.aggregate({
      where: { userId: user.id },
      _sum: { delta: true },
    });
    expect(sum._sum.delta).toBe(0); // 100 top-up - 100 redemption
  });

  it('allows only one redemption under concurrent clicks (same key)', async () => {
    await topUp(user.id, 100);
    const key = randomUUID();
    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () =>
        rewardsService.redeem(user.id, rewardId, key),
      ),
    );
    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    expect(fulfilled).toHaveLength(1); // 4 rejected by the Redis NX lock

    // and only ONE redemption row exists for this key
    const rows = await prisma.redemption.findMany({
      where: { idempotencyKey: key },
    });
    expect(rows).toHaveLength(1);
  });

  it('retry with the same key after success returns the original redemption, no double charge', async () => {
    await topUp(user.id, 100);
    const key = randomUUID();
    const first = await rewardsService.redeem(user.id, rewardId, key);
    // simulate a late client retry: Redis lock already expired
    await app
      .get<import('ioredis').default>('REDIS_CLIENT')
      .del(`redeem:${user.id}:${key}`);
    const second = await rewardsService.redeem(user.id, rewardId, key);
    expect(second.id).toBe(first.id);

    const charges = await prisma.pointLedger.count({
      where: { userId: user.id, type: 'REDEMPTION' },
    });
    // previous tests created 2 redemptions; this one adds exactly 1 more
    expect(charges).toBe(3);
  });

  it('concurrent redeems with different keys are limited by balance', async () => {
    // current balance: 0 -> top up exactly one reward's worth
    await topUp(user.id, 100);
    const results = await Promise.allSettled([
      rewardsService.redeem(user.id, rewardId, randomUUID()),
      rewardsService.redeem(user.id, rewardId, randomUUID()),
      rewardsService.redeem(user.id, rewardId, randomUUID()),
    ]);
    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    expect(fulfilled).toHaveLength(1); // balance covers exactly one

    const sum = await prisma.pointLedger.aggregate({
      where: { userId: user.id },
      _sum: { delta: true },
    });
    expect(sum._sum.delta).toBeGreaterThanOrEqual(0); // never negative
  });
});
