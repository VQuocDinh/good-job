import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { currentYearMonth } from '../../common/utils/year-month';
import { LedgerType } from '../../common/constants/ledger';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateCommentDto } from './dto/create-comment.dto';
import { GiveKudoDto } from './dto/give-kudo.dto';
import { UpdateKudoDto } from './dto/update-kudo.dto';

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

  /**
   * Feed with cursor pagination on (createdAt, id) — no OFFSET, so page N
   * stays cheap and stable while new kudos keep arriving on top.
   */
  async getFeed(cursor: string | undefined, limit: number) {
    const items = await this.prisma.kudo.findMany({
      take: limit + 1, // fetch one extra to know if there is a next page
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      include: {
        sender: { select: { id: true, name: true } },
        receiver: { select: { id: true, name: true } },
        media: true,
        reactions: true,
        comments: { orderBy: { createdAt: 'asc' } },
      },
    });
    const hasMore = items.length > limit;
    const page = hasMore ? items.slice(0, limit) : items;
    return {
      items: page,
      nextCursor: hasMore ? page[page.length - 1].id : null,
    };
  }

  /** Sender-only edit of description/coreValue — never points. */
  async updateKudo(userId: string, kudoId: string, dto: UpdateKudoDto) {
    const kudo = await this.prisma.kudo.findUnique({ where: { id: kudoId } });
    if (!kudo) throw new NotFoundException('Kudo not found');
    if (kudo.senderId !== userId) {
      throw new ForbiddenException('Only the sender can edit this kudo');
    }
    return this.prisma.kudo.update({
      where: { id: kudoId },
      data: { description: dto.description, coreValue: dto.coreValue },
    });
  }

  /**
   * Sender-only delete. Points already live in the receiver's ledger, so
   * consistency is restored in one transaction:
   * - refund the sender's budget of the month the kudo was given in
   * - append a reversal ledger entry (negative delta, KUDO_REVOKED) for
   *   the receiver — the original entry stays (append-only audit trail)
   */
  async deleteKudo(userId: string, kudoId: string) {
    const kudo = await this.prisma.kudo.findUnique({ where: { id: kudoId } });
    if (!kudo) throw new NotFoundException('Kudo not found');
    if (kudo.senderId !== userId) {
      throw new ForbiddenException('Only the sender can delete this kudo');
    }

    const ym = currentYearMonth(kudo.createdAt);

    await this.prisma.$transaction(async (tx) => {
      await tx.givingBudget.update({
        where: { userId_yearMonth: { userId, yearMonth: ym } },
        data: { spent: { decrement: kudo.points } },
      });
      await tx.pointLedger.create({
        data: {
          userId: kudo.receiverId,
          delta: -kudo.points,
          type: LedgerType.KUDO_REVOKED,
          referenceId: kudo.id,
        },
      });
      // children first (FK), then the kudo itself
      await tx.reaction.deleteMany({ where: { kudoId } });
      await tx.comment.deleteMany({ where: { kudoId } });
      await tx.kudoMedia.deleteMany({ where: { kudoId } });
      await tx.kudo.delete({ where: { id: kudoId } });
    });

    return { deleted: true };
  }

  /** Idempotent add: same (kudo, user, emoji) twice is a no-op. */
  async addReaction(userId: string, kudoId: string, emoji: string) {
    const kudo = await this.prisma.kudo.findUnique({
      where: { id: kudoId },
      select: { id: true },
    });
    if (!kudo) throw new NotFoundException('Kudo not found');
    return this.prisma.reaction.upsert({
      where: { kudoId_userId_emoji: { kudoId, userId, emoji } },
      create: { kudoId, userId, emoji },
      update: {},
    });
  }

  async addComment(userId: string, kudoId: string, dto: CreateCommentDto) {
    if (!dto.text && !dto.mediaUrl) {
      throw new BadRequestException('Comment needs text or media');
    }
    const kudo = await this.prisma.kudo.findUnique({
      where: { id: kudoId },
      select: { id: true },
    });
    if (!kudo) throw new NotFoundException('Kudo not found');
    return this.prisma.comment.create({
      data: { kudoId, userId, text: dto.text, mediaUrl: dto.mediaUrl },
    });
  }
}
