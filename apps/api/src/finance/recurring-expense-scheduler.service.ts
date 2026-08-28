import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AppLoggerService } from '../common/logger/app-logger.service';
import { FinanceService } from './finance.service';

/** Materializa despesas recorrentes da competência atual — nunca antecipa meses futuros. */
@Injectable()
export class RecurringExpenseSchedulerService {
  constructor(
    private readonly financeService: FinanceService,
    private readonly logger: AppLoggerService,
  ) {
    this.logger.setContext('RecurringExpenseScheduler');
  }

  @Cron(CronExpression.EVERY_DAY_AT_1AM)
  async materialize() {
    const created = await this.financeService.materializeRecurringExpenses();
    if (created > 0) {
      this.logger.log('recurring_expenses_materialized', { operation: 'materialize', count: created });
    }
  }
}
