import { Injectable } from '@nestjs/common';
import { currentYearMonth } from '../../common/utils/year-month';
import { PrismaService } from '../../prisma/prisma.service';
import { EmbeddingsService } from '../ai/embeddings.service';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: EmbeddingsService,
  ) {}

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

  /**
   * AI summary of this month's received recognition. Falls back to a
   * deterministic stats summary when Gemini is not configured.
   */
  async getMonthlySummary(userId: string) {
    const now = new Date();
    const monthStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
    );
    const kudos = await this.prisma.kudo.findMany({
      where: { receiverId: userId, createdAt: { gte: monthStart } },
      select: {
        points: true,
        description: true,
        coreValue: true,
        sender: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (kudos.length === 0) {
      return { summary: 'No kudos received this month yet.', ai: false };
    }

    const totalPoints = kudos.reduce((sum, k) => sum + k.points, 0);
    const byValue = new Map<string, number>();
    for (const k of kudos) {
      byValue.set(k.coreValue, (byValue.get(k.coreValue) ?? 0) + 1);
    }
    const topValue = [...byValue.entries()].sort((a, b) => b[1] - a[1])[0][0];

    const aiSummary = await this.ai.generateText(
      `Summarize this employee's recognition for the month in 2-3 friendly sentences (second person, no preamble). ` +
        `They received ${kudos.length} kudos totalling ${totalPoints} points. Kudos:\n` +
        kudos
          .map((k) => `- ${k.points}pts ${k.coreValue} from ${k.sender.name}: ${k.description}`)
          .join('\n'),
    );

    return {
      summary:
        aiSummary ??
        `This month you received ${kudos.length} kudos (${totalPoints} points). ` +
          `You were recognized most for ${topValue}.`,
      ai: !!aiSummary,
      stats: { count: kudos.length, totalPoints, topValue },
    };
  }
}
