import { Module } from '@nestjs/common';
import { NotificationPublisher } from './notification-publisher.service';
import { NotificationsController } from './notifications.controller';
import { NotificationsGateway } from './notifications.gateway';
import { NotificationsService } from './notifications.service';

@Module({
  controllers: [NotificationsController],
  providers: [NotificationsService, NotificationPublisher, NotificationsGateway],
  exports: [NotificationsService, NotificationPublisher],
})
export class NotificationsModule {}
