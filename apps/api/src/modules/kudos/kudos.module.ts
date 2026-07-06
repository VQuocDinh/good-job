import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { KudosController } from './kudos.controller';
import { KudosService } from './kudos.service';

@Module({
  imports: [NotificationsModule],
  controllers: [KudosController],
  providers: [KudosService],
  exports: [KudosService],
})
export class KudosModule {}
