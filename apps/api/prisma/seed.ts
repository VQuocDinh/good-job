import * as path from 'node:path';
import { config as loadEnv } from 'dotenv';
import { PrismaClient } from '@prisma/client';

// load root .env so this also works when invoked directly via `ts-node prisma/seed.ts`
loadEnv({ path: path.resolve(__dirname, '../../../.env') });

const prisma = new PrismaClient();

// Seed create data for reviewer: user, reward, and some sample kudos.
// Kudo seed goes "short cut" (no through service so no budget deduction),
// but still records PointLedger to maintain balance and consistent history.
async function main() {
  // upsert to run multiple times without violating unique constraint
  const alice = await prisma.user.upsert({
    where: { email: 'alice@goodjob.dev' },
    update: {},
    create: { email: 'alice@goodjob.dev', name: 'Alice Nguyen' },
  });
  const bob = await prisma.user.upsert({
    where: { email: 'bob@goodjob.dev' },
    update: {},
    create: { email: 'bob@goodjob.dev', name: 'Bob Tran' },
  });
  const carol = await prisma.user.upsert({
    where: { email: 'carol@goodjob.dev' },
    update: {},
    create: { email: 'carol@goodjob.dev', name: 'Carol Le' },
  });

  // Reward does not have a natural unique column → upsert by fixed id
  await prisma.reward.upsert({
    where: { id: 'seed-hoodie' },
    update: {},
    create: { id: 'seed-hoodie', name: 'Company Hoodie', cost: 500 },
  });
  await prisma.reward.upsert({
    where: { id: 'seed-friday-off' },
    update: {},
    create: { id: 'seed-friday-off', name: 'Friday Afternoon Off', cost: 1000 },
  });
  await prisma.reward.upsert({
    where: { id: 'seed-coffee' },
    update: {},
    create: { id: 'seed-coffee', name: 'Coffee Voucher', cost: 100 },
  });

  const seedKudos = [
    {
      id: 'seed-kudo-1',
      senderId: alice.id,
      receiverId: bob.id,
      points: 30,
      description: 'Cảm ơn Bob đã hỗ trợ fix bug production lúc nửa đêm!',
      coreValue: '#Ownership',
    },
    {
      id: 'seed-kudo-2',
      senderId: bob.id,
      receiverId: carol.id,
      points: 20,
      description: 'Carol onboard bạn mới rất chu đáo, tài liệu đầy đủ.',
      coreValue: '#Teamwork',
    },
    {
      id: 'seed-kudo-3',
      senderId: carol.id,
      receiverId: alice.id,
      points: 50,
      description: 'Alice dẫn dắt buổi retro cực kỳ hiệu quả, cả team học được nhiều.',
      coreValue: '#Growth',
    },
  ];

  for (const k of seedKudos) {
    const existing = await prisma.kudo.findUnique({ where: { id: k.id } });
    if (existing) continue;
    await prisma.$transaction([
      prisma.kudo.create({ data: k }),
      prisma.pointLedger.create({
        data: {
          userId: k.receiverId,
          delta: k.points,
          type: 'KUDO_RECEIVED',
          referenceId: k.id,
        },
      }),
    ]);
  }

  console.log('Seed completed');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
