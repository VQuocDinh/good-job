import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import Redis from 'ioredis';
import { LedgerType } from '../../common/constants/ledger';
import { PrismaService } from '../../prisma/prisma.service';
import { REDIS_CLIENT } from '../../redis/redis.constants';

@Injectable()
export class RewardsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) { }

  /**
   * Redeems a reward with 3 anti-double-spend layers:
   * 1. Redis NX lock — fast rejection of rapid duplicate clicks.
   * 2. Unique idempotencyKey — a retry after success returns the existing
   *    redemption (caught via Prisma P2002) instead of charging twice.
   * 3. User row lock (SELECT ... FOR UPDATE) — serializes all redemptions
   *    of this user so the ledger SUM balance check cannot race.
   */
  async redeem(userId: string, rewardId: string, idempotencyKey: string) {
    // LAYER 1: short-lived Redis lock rejects rapid duplicate clicks.
    const lock = await this.redis.set(
      `redeem:${userId}:${idempotencyKey}`,
      '1',
      'EX',
      10,
      'NX',
    );
    if (!lock) {
      throw new ConflictException('Duplicate request');
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        const reward = await tx.reward.findUnique({ where: { id: rewardId } });
        if (!reward || !reward.active) {
          throw new NotFoundException('Reward not found');
        }

        // LAYER 3: lock the User row as the serialization point for all
        // redemptions of this user. Never `SELECT SUM(...) FOR UPDATE` —
        // Postgres forbids FOR UPDATE with aggregate functions.
        await tx.$queryRaw`
          SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE
        `;

        // Balance is safe to compute now: concurrent redeems of the same
        // user are queued behind the row lock above.
        const [row] = await tx.$queryRaw<Array<{ balance: number }>>`
          SELECT COALESCE(SUM("delta"), 0)::int AS balance
          FROM "PointLedger" WHERE "userId" = ${userId}
        `;
        if (row.balance < reward.cost) {
          throw new BadRequestException('Insufficient balance');
        }

        // LAYER 2: unique idempotencyKey — a concurrent/late duplicate
        // that slipped past Redis throws P2002 here.
        const redemption = await tx.redemption.create({
          data: { userId, rewardId, cost: reward.cost, idempotencyKey },
        });
        await tx.pointLedger.create({
          data: {
            userId,
            delta: -reward.cost,
            type: LedgerType.REDEMPTION,
            referenceId: redemption.id,
          },
        });
        return redemption;
      });
    } catch (e) {
      // Retry with the same idempotencyKey after a successful redemption:
      // return the existing redemption (idempotent semantics), not a 500.
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        const existing = await this.prisma.redemption.findUnique({
          where: { idempotencyKey },
        });
        if (existing) return existing;
      }
      throw e;
    }
  }
}
