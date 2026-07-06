import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { resolve } from 'node:path';
import { AppModule } from './app.module';
import { PrismaExceptionFilter } from './common/filters/prisma-exception.filter';
import { corsOrigin } from './config/cors';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  app.enableCors({ origin: corsOrigin() });

  app.set('trust proxy', 1);
  app.use(
    helmet({
      // uploads are consumed by the web app on another origin
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );

  // uploaded media is served statically; files land here via multer diskStorage
  app.useStaticAssets(resolve(process.env.UPLOAD_DIR ?? './uploads'), {
    prefix: '/uploads/',
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // strip properties not declared in the DTO
      forbidNonWhitelisted: true, // 400 on unknown properties instead of silently dropping
      transform: true, // convert payloads to DTO class instances (+ @Type coercion)
    }),
  );
  app.useGlobalFilters(new PrismaExceptionFilter());

  // required so onModuleDestroy/onApplicationShutdown run (Prisma + Redis cleanup)
  app.enableShutdownHooks();

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
