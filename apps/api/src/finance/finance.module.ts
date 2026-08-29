import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { AuditModule } from '../audit/audit.module';
import { FiscalModule } from '../fiscal/fiscal.module';
import { FinanceController } from './finance.controller';
import { FinanceService } from './finance.service';
import { RecurringExpenseSchedulerService } from './recurring-expense-scheduler.service';

@Module({
  imports: [AuditModule, ScheduleModule.forRoot(), FiscalModule],
  controllers: [FinanceController],
  providers: [FinanceService, RecurringExpenseSchedulerService],
  exports: [FinanceService],
})
export class FinanceModule {}
