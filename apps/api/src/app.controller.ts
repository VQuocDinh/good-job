import { Controller, Get, Inject, ServiceUnavailableException } from '@nestjs/common';
import Redis from 'ioredis';
import { AppService } from './app.service';
import { PrismaService } from './prisma/prisma.service';
import { REDIS_CLIENT } from './redis/redis.constants';

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly prisma: PrismaService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  /** Liveness/readiness probe for orchestrators and compose healthchecks. */
  @Get('health')
  async health() {
    const [db, redis] = await Promise.allSettled([
      this.prisma.$queryRaw`SELECT 1`,
      this.redis.ping(),
    ]);
    const status = {
      db: db.status === 'fulfilled' ? 'up' : 'down',
      redis: redis.status === 'fulfilled' ? 'up' : 'down',
    };
    if (status.db !== 'up' || status.redis !== 'up') {
      throw new ServiceUnavailableException({ status: 'error', ...status });
    }
    return { status: 'ok', ...status };
  }
}
