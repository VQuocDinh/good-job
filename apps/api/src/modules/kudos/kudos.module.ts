import { Module } from '@nestjs/common';
import { KudosService } from './kudos.service';

@Module({
  providers: [KudosService],
  exports: [KudosService],
})
export class KudosModule {}
