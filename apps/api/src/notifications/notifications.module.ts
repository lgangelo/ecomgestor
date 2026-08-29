import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { FiscalModule } from '../fiscal/fiscal.module';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { NotificationsSchedulerService } from './notifications-scheduler.service';

@Module({
  imports: [ScheduleModule.forRoot(), FiscalModule],
  controllers: [NotificationsController],
  providers: [NotificationsService, NotificationsSchedulerService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
