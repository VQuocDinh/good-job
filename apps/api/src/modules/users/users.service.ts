import { Injectable } from '@nestjs/common';
import { currentYearMonth } from '../../common/utils/year-month';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  /** Directory of users (for the give-kudo receiver picker). */
  list() {
    return this.prisma.user.findMany({
      select: { id: true, email: true, name: true },
      orderBy: { name: 'asc' },
    });
  }

  /** Current-month giving budget. A missing row means nothing spent yet. */
  async getBudget(userId: string) {
    const ym = currentYearMonth();
    const budget = await this.prisma.givingBudget.findUnique({
      where: { userId_yearMonth: { userId, yearMonth: ym } },
    });
    const allocated = budget?.allocated ?? 200;
    const spent = budget?.spent ?? 0;
    return { yearMonth: ym, allocated, spent, remaining: allocated - spent };
  }

  /** Redeemable balance = SUM(delta) over the append-only ledger. */
  async getBalance(userId: string) {
    const result = await this.prisma.pointLedger.aggregate({
      where: { userId },
      _sum: { delta: true },
    });
    return { balance: result._sum.delta ?? 0 };
  }
}
