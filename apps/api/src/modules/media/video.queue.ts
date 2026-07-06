import { Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';

export const VIDEO_QUEUE = 'VIDEO_QUEUE';
export const VIDEO_QUEUE_NAME = 'video-processing';

export interface VideoJobData {
  mediaId: string;
  kudoId: string;
  filePath: string;
}

/**
 * BullMQ opens its own Redis connections (worker blocking reads need
 * maxRetriesPerRequest: null) — pass plain options, not a shared client.
 */
export function createBullConnection(config: ConfigService) {
  const url = new URL(config.get<string>('REDIS_URL', 'redis://localhost:6379'));
  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    maxRetriesPerRequest: null,
  };
}

export const videoQueueProvider: Provider = {
  provide: VIDEO_QUEUE,
  inject: [ConfigService],
  useFactory: (config: ConfigService) =>
    new Queue<VideoJobData>(VIDEO_QUEUE_NAME, {
      connection: createBullConnection(config),
    }),
};
