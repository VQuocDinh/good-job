import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  async onModuleInit() {
    await this.$connect(); // fail early if DATABASE_URL is wrong
  }

  async onModuleDestroy() {
    await this.$disconnect(); // close pool when app is stopped to prevent test/CI from hanging
  }
}
