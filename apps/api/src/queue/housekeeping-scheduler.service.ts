import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { QueueService } from './queue.service';

/** Enfileira periodicamente os jobs de manutenção consumidos pelo worker. */
@Injectable()
export class HousekeepingSchedulerService {
  constructor(private readonly queueService: QueueService) {}

  @Cron(CronExpression.EVERY_HOUR)
  async scheduleHousekeeping() {
    await this.queueService.enqueuePurgeExpiredRefreshTokens();
  }
}
