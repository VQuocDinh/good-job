import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job, Worker } from 'bullmq';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import Redis from 'ioredis';
import { PrismaService } from '../../prisma/prisma.service';
import { REDIS_CLIENT } from '../../redis/redis.constants';
import {
  createBullConnection,
  VIDEO_QUEUE_NAME,
  VideoJobData,
} from './video.queue';

const execFileAsync = promisify(execFile);
// eslint-disable-next-line @typescript-eslint/no-require-imports
const ffprobePath: string = require('ffprobe-static').path;

/**
 * BullMQ worker: validates video duration (≤ MAX_VIDEO_DURATION_SECONDS)
 * off the request path. Reads metadata via ffprobe (streams the file
 * header — never loads the video into memory).
 */
@Injectable()
export class VideoProcessor implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(VideoProcessor.name);
  private worker!: Worker<VideoJobData>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  onModuleInit() {
    // jest e2e boots/tears down many apps; the worker's blocking Redis
    // read races shutdown and throws after close. The video pipeline has
    // its own runtime E2E — skip the in-process worker under test.
    if (process.env.NODE_ENV === 'test') return;
    this.worker = new Worker<VideoJobData>(
      VIDEO_QUEUE_NAME,
      (job) => this.process(job),
      { connection: createBullConnection(this.config) },
    );
    this.worker.on('failed', (job, err) =>
      this.logger.error(`job ${job?.id} failed: ${err.message}`),
    );
    // without an error listener BullMQ re-emits as an unhandled exception
    // (e.g. the blocking read erroring during shutdown)
    this.worker.on('error', (err) =>
      this.logger.warn(`worker error: ${err.message}`),
    );
  }

  async onModuleDestroy() {
    await this.worker?.close();
  }

  private async process(job: Job<VideoJobData>) {
    const { mediaId, kudoId, filePath } = job.data;
    const maxSeconds = Number(
      this.config.get('MAX_VIDEO_DURATION_SECONDS', '180'),
    );

    let status: 'ready' | 'failed';
    try {
      const duration = await this.probeDuration(filePath);
      status = duration <= maxSeconds ? 'ready' : 'failed';
      if (status === 'failed') {
        this.logger.warn(
          `media ${mediaId}: duration ${duration.toFixed(1)}s > ${maxSeconds}s`,
        );
      }
    } catch (e) {
      this.logger.error(`media ${mediaId}: ffprobe failed: ${(e as Error).message}`);
      status = 'failed';
    }

    await this.prisma.kudoMedia.update({
      where: { id: mediaId },
      data: { status },
    });

    // let feed viewers swap the "processing" badge for the player
    await this.redis.publish(
      `media:${kudoId}`,
      JSON.stringify({ kudoId, mediaId, status }),
    );
  }

  private async probeDuration(filePath: string): Promise<number> {
    const { stdout } = await execFileAsync(ffprobePath, [
      '-v',
      'error',
      '-show_entries',
      'format=duration',
      '-of',
      'csv=p=0',
      filePath,
    ]);
    const duration = parseFloat(stdout.trim());
    if (Number.isNaN(duration)) throw new Error(`unparsable duration: ${stdout}`);
    return duration;
  }
}
