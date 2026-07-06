import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { currentYearMonth } from '../../common/utils/year-month';
import { extractMentionTokens } from '../../common/utils/mentions';
import { LedgerType } from '../../common/constants/ledger';
import { PrismaService } from '../../prisma/prisma.service';
import { EmbeddingsService } from '../ai/embeddings.service';
import {
  NotificationInput,
  NotificationPublisher,
} from '../notifications/notification-publisher.service';
import { CreateCommentDto } from './dto/create-comment.dto';
import { GiveKudoDto } from './dto/give-kudo.dto';
import { UpdateKudoDto } from './dto/update-kudo.dto';

@Injectable()
export class KudosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationPublisher,
    private readonly embeddings: EmbeddingsService,
  ) {}

  /** Resolves "@alice" tokens to users by email local part. */
  private async findMentionedUsers(
    tx: Prisma.TransactionClient,
    text: string,
  ) {
    const tokens = extractMentionTokens(text);
    if (tokens.length === 0) return [];
    return tx.user.findMany({
      where: { OR: tokens.map((t) => ({ email: { startsWith: `${t}@` } })) },
      select: { id: true, name: true },
    });
  }

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

    const { kudo, notifs } = await this.prisma.$transaction(async (tx) => {
      const receiver = await tx.user.findUnique({
        where: { id: dto.receiverId },
        select: { id: true },
      });
      if (!receiver) {
        throw new NotFoundException('Receiver not found');
      }
      const sender = await tx.user.findUniqueOrThrow({
        where: { id: senderId },
        select: { name: true },
      });

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

      // notifications: receiver + everyone @mentioned in the description
      const inputs: NotificationInput[] = [
        {
          userId: dto.receiverId,
          type: 'KUDO_RECEIVED',
          payload: {
            message: `${sender.name} sent you ${dto.points} points: "${dto.description.slice(0, 80)}"`,
            kudoId: kudo.id,
            actorId: senderId,
          },
        },
      ];
      const mentioned = await this.findMentionedUsers(tx, dto.description);
      for (const user of mentioned) {
        if (user.id === senderId || user.id === dto.receiverId) continue;
        inputs.push({
          userId: user.id,
          type: 'TAGGED',
          payload: {
            message: `${sender.name} tagged you in a kudo`,
            kudoId: kudo.id,
            actorId: senderId,
          },
        });
      }
      await this.notifications.createMany(tx, inputs);

      return { kudo, notifs: inputs };
    });

    // publish only after commit: sockets must never see uncommitted rows
    await this.notifications.publish(notifs);
    // fire-and-forget: embedding powers search only, must not delay the give
    void this.storeEmbedding(kudo.id, dto.description);
    return kudo;
  }

  /** Embed the description and store it for semantic search (best effort). */
  private async storeEmbedding(kudoId: string, description: string) {
    const vector = await this.embeddings.embed(description);
    if (!vector) return;
    await this.prisma
      .$executeRaw`UPDATE "Kudo" SET "embedding" = ${`[${vector.join(',')}]`}::vector WHERE "id" = ${kudoId}`;
  }

  /**
   * Semantic search over kudo descriptions (pgvector cosine distance).
   * Falls back to plain ILIKE keyword match when AI is not configured.
   */
  async search(q: string, limit: number) {
    const vector = await this.embeddings.embed(q);
    let ids: string[];
    if (vector) {
      const rows = await this.prisma.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "Kudo"
        WHERE "embedding" IS NOT NULL
        ORDER BY "embedding" <=> ${`[${vector.join(',')}]`}::vector
        LIMIT ${limit}
      `;
      ids = rows.map((r) => r.id);
    } else {
      const rows = await this.prisma.kudo.findMany({
        where: {
          OR: [
            { description: { contains: q, mode: 'insensitive' } },
            { coreValue: { contains: q, mode: 'insensitive' } },
          ],
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        select: { id: true },
      });
      ids = rows.map((r) => r.id);
    }

    if (ids.length === 0) return { items: [], semantic: !!vector };
    const items = await this.prisma.kudo.findMany({
      where: { id: { in: ids } },
      include: {
        sender: { select: { id: true, name: true } },
        receiver: { select: { id: true, name: true } },
        media: true,
        reactions: true,
        comments: { orderBy: { createdAt: 'asc' } },
      },
    });
    // findMany does not preserve the similarity ranking — restore it
    const order = new Map(ids.map((id, i) => [id, i]));
    items.sort((a, b) => order.get(a.id)! - order.get(b.id)!);
    return { items, semantic: !!vector };
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

    const { comment, notifs } = await this.prisma.$transaction(async (tx) => {
      const kudo = await tx.kudo.findUnique({
        where: { id: kudoId },
        select: { id: true, senderId: true, receiverId: true },
      });
      if (!kudo) throw new NotFoundException('Kudo not found');
      const author = await tx.user.findUniqueOrThrow({
        where: { id: userId },
        select: { name: true },
      });

      const comment = await tx.comment.create({
        data: { kudoId, userId, text: dto.text, mediaUrl: dto.mediaUrl },
      });

      // notify kudo participants + @mentions (never the author themselves)
      const targets = new Map<string, NotificationInput['type']>();
      for (const participant of [kudo.senderId, kudo.receiverId]) {
        if (participant !== userId) targets.set(participant, 'COMMENT');
      }
      const mentioned = await this.findMentionedUsers(tx, dto.text ?? '');
      for (const user of mentioned) {
        if (user.id !== userId) targets.set(user.id, 'TAGGED');
      }
      const inputs: NotificationInput[] = [...targets].map(
        ([targetId, type]) => ({
          userId: targetId,
          type,
          payload: {
            message:
              type === 'TAGGED'
                ? `${author.name} tagged you in a comment`
                : `${author.name} commented on your kudo`,
            kudoId,
            actorId: userId,
          },
        }),
      );
      await this.notifications.createMany(tx, inputs);

      return { comment, notifs: inputs };
    });

    await this.notifications.publish(notifs);
    return comment;
  }
}
