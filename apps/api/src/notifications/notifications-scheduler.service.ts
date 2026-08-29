import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AppLoggerService } from '../common/logger/app-logger.service';
import { NotificationsService } from './notifications.service';

/** Reconciliação periódica das notificações (seção 41-43 da Fase 4) — mesmo padrão de job direto
 * via @Cron do `RecurringExpenseSchedulerService`, sem criar uma fila BullMQ nova para isso. */
@Injectable()
export class NotificationsSchedulerService {
  constructor(
    private readonly notificationsService: NotificationsService,
    private readonly logger: AppLoggerService,
  ) {
    this.logger.setContext('NotificationsScheduler');
  }

  @Cron(CronExpression.EVERY_10_MINUTES)
  async reconcile() {
    const activeCount = await this.notificationsService.reconcileAll();
    this.logger.log('notifications_reconciled', { operation: 'reconcile', activeCount });
  }
}
