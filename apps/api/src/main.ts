import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { PrismaExceptionFilter } from './common/filters/prisma-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.enableCors({ origin: true });

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
