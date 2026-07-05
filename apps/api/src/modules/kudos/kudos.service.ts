import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { currentYearMonth } from '../../common/utils/year-month';
import { LedgerType } from '../../common/constants/ledger';
import { PrismaService } from '../../prisma/prisma.service';
import { GiveKudoDto } from './dto/give-kudo.dto';

@Injectable()
export class KudosService {
  constructor(private readonly prisma: PrismaService) { }

  /**
   * Gives kudos atomically:
   * 1. Lock the sender's GivingBudget row (SELECT ... FOR UPDATE) so
   *    concurrent gives cannot overspend the monthly budget.
   * 2. Increment spent, create the Kudo, and append a KUDO_RECEIVED
   *    ledger entry for the receiver — all in one transaction.
   */
  async giveKudo(senderId: string, dto: GiveKudoDto) {
    if (senderId === dto.receiverId) {
      throw new BadRequestException('Cannot give kudos to yourself');
    }
    if (dto.points < 10 || dto.points > 50) {
      throw new BadRequestException('Points must be between 10 and 50');
    }

    const ym = currentYearMonth();

    return this.prisma.$transaction(async (tx) => {
      const receiver = await tx.user.findUnique({
        where: { id: dto.receiverId },
        select: { id: true },
      });
      if (!receiver) {
        throw new NotFoundException('Receiver not found');
      }

      // Ensure the budget row exists for this month (implicit monthly reset:
      // a fresh row per (userId, yearMonth) starts at spent=0).
      await tx.givingBudget.upsert({
        where: { userId_yearMonth: { userId: senderId, yearMonth: ym } },
        create: { userId: senderId, yearMonth: ym },
        update: {},
      });

      // Lock the row so concurrent transactions serialize on it. Never
      // FOR UPDATE with an aggregate — Postgres forbids it.
      const [budget] = await tx.$queryRaw<
        Array<{ allocated: number; spent: number }>
      >`
        SELECT "allocated", "spent" FROM "GivingBudget"
        WHERE "userId" = ${senderId} AND "yearMonth" = ${ym}
        FOR UPDATE
      `;

      if (budget.spent + dto.points > budget.allocated) {
        throw new BadRequestException(
          `Exceeds monthly giving budget (${budget.allocated - budget.spent} points left)`,
        );
      }

      await tx.givingBudget.update({
        where: { userId_yearMonth: { userId: senderId, yearMonth: ym } },
        data: { spent: { increment: dto.points } },
      });

      const kudo = await tx.kudo.create({
        data: {
          senderId,
          receiverId: dto.receiverId,
          points: dto.points,
          description: dto.description,
          coreValue: dto.coreValue,
        },
      });

      await tx.pointLedger.create({
        data: {
          userId: dto.receiverId,
          delta: dto.points,
          type: LedgerType.KUDO_RECEIVED,
          referenceId: kudo.id,
        },
      });

      return kudo;
    });
  }
}
