import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard } from '@nestjs/throttler';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

/** Boot the real AppModule (real DB/Redis), rate limiting disabled. */
export async function createTestApp(): Promise<{
  app: INestApplication;
  prisma: PrismaService;
}> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  })
    // concurrency tests fire bursts — the 100 req/min limiter would 429 them
    .overrideGuard(ThrottlerGuard)
    .useValue({ canActivate: () => true })
    .compile();

  const app = moduleRef.createNestApplication();
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  await app.init();
  return { app, prisma: app.get(PrismaService) };
}

/** Unique-per-run test users so suites never clash with seed data. */
export async function createTestUsers(
  prisma: PrismaService,
  tag: string,
  names: string[],
) {
  return Promise.all(
    names.map((name) =>
      prisma.user.create({
        data: { email: `${name}-${tag}@e2e.test`, name },
      }),
    ),
  );
}

/** Delete everything the given users touched (FK-safe order). */
export async function cleanupUsers(prisma: PrismaService, userIds: string[]) {
  const kudos = await prisma.kudo.findMany({
    where: {
      OR: [{ senderId: { in: userIds } }, { receiverId: { in: userIds } }],
    },
    select: { id: true },
  });
  const kudoIds = kudos.map((k) => k.id);
  await prisma.reaction.deleteMany({ where: { kudoId: { in: kudoIds } } });
  await prisma.comment.deleteMany({ where: { kudoId: { in: kudoIds } } });
  await prisma.kudoMedia.deleteMany({ where: { kudoId: { in: kudoIds } } });
  await prisma.notification.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.redemption.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.pointLedger.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.kudo.deleteMany({ where: { id: { in: kudoIds } } });
  await prisma.givingBudget.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
}
