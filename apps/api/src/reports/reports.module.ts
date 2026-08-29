import { Module } from '@nestjs/common';
import { FiscalModule } from '../fiscal/fiscal.module';
import { ReportsController } from './reports.controller';
import { ReportsService, SalesExportService } from './reports.service';

@Module({
  imports: [FiscalModule],
  controllers: [ReportsController],
  providers: [ReportsService, SalesExportService],
})
export class ReportsModule {}
