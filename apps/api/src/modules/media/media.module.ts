import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MulterModule } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, resolve } from 'node:path';
import { mkdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { NotificationsModule } from '../notifications/notifications.module';
import { MediaController } from './media.controller';
import { MediaService } from './media.service';
import { VideoProcessor } from './video.processor';
import { VIDEO_QUEUE, videoQueueProvider } from './video.queue';

@Module({
  imports: [
    NotificationsModule,
    // diskStorage streams the upload straight to disk — the file is never
    // buffered in memory (OOM-safe), unlike memoryStorage
    MulterModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const dir = resolve(config.get<string>('UPLOAD_DIR', './uploads'));
        mkdirSync(dir, { recursive: true });
        return {
          storage: diskStorage({
            destination: dir,
            filename: (_req, file, cb) =>
              cb(null, `${randomUUID()}${extname(file.originalname)}`),
          }),
          limits: { fileSize: 200 * 1024 * 1024 }, // reject oversized early
        };
      },
    }),
  ],
  controllers: [MediaController],
  providers: [MediaService, VideoProcessor, videoQueueProvider],
  exports: [VIDEO_QUEUE],
})
export class MediaModule {}
