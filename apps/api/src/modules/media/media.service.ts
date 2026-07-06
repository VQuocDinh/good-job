import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Queue } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { VIDEO_QUEUE, VideoJobData } from './video.queue';

@Injectable()
export class MediaService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(VIDEO_QUEUE) private readonly videoQueue: Queue<VideoJobData>,
  ) {}

  /**
   * Attach an uploaded file to a kudo.
   * Images are ready immediately. Videos are stored as `processing` and
   * validated by a BullMQ worker — the request returns right away, the
   * server is never blocked by video work.
   */
  async attach(userId: string, kudoId: string, file: Express.Multer.File) {
    const isVideo = file.mimetype.startsWith('video/');
    const isImage = file.mimetype.startsWith('image/');
    if (!isVideo && !isImage) {
      throw new BadRequestException('Only image or video uploads are allowed');
    }

    const kudo = await this.prisma.kudo.findUnique({
      where: { id: kudoId },
      select: { id: true, senderId: true },
    });
    if (!kudo) throw new NotFoundException('Kudo not found');
    if (kudo.senderId !== userId) {
      throw new ForbiddenException('Only the sender can attach media');
    }

    const media = await this.prisma.kudoMedia.create({
      data: {
        kudoId,
        url: `/uploads/${file.filename}`,
        type: isVideo ? 'video' : 'image',
        status: isVideo ? 'processing' : 'ready',
      },
    });

    if (isVideo) {
      await this.videoQueue.add('validate', {
        mediaId: media.id,
        kudoId,
        filePath: file.path,
      });
    }

    return media;
  }
}
