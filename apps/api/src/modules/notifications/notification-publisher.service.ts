import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '../../redis/redis.constants';

export interface NotificationInput {
  userId: string;
  type: 'TAGGED' | 'KUDO_RECEIVED' | 'COMMENT' | 'REACTION';
  payload: { message: string; kudoId?: string; actorId?: string };
}

/**
 * Two-step delivery so realtime can never observe uncommitted data:
 * 1. createMany(tx, ...) INSIDE the business transaction (atomic with it)
 * 2. publish(...) AFTER the transaction commits — pushed via Redis Pub/Sub
 *    so it reaches the user's socket even when it lives on another API
 *    instance (multi-instance safe).
 */
@Injectable()
export class NotificationPublisher {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async createMany(tx: Prisma.TransactionClient, inputs: NotificationInput[]) {
    if (inputs.length === 0) return;
    await tx.notification.createMany({
      data: inputs.map((n) => ({
        userId: n.userId,
        type: n.type,
        payload: n.payload,
      })),
    });
  }

  async publish(inputs: NotificationInput[]) {
    await Promise.all(
      inputs.map((n) =>
        this.redis.publish(
          `notifications:${n.userId}`,
          JSON.stringify({ type: n.type, payload: n.payload }),
        ),
      ),
    );
  }
}
