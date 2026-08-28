import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { QueueService } from './queue.service';
import { HousekeepingSchedulerService } from './housekeeping-scheduler.service';

@Module({
  imports: [ScheduleModule.forRoot()],
  providers: [QueueService, HousekeepingSchedulerService],
  exports: [QueueService],
})
export class QueueModule {}
