import { Module } from '@nestjs/common';
import { KudosController } from './kudos.controller';
import { KudosService } from './kudos.service';

@Module({
  controllers: [KudosController],
  providers: [KudosService],
  exports: [KudosService],
})
export class KudosModule {}
