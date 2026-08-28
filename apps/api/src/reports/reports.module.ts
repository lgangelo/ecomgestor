import { Module } from '@nestjs/common';
import { ReportsController } from './reports.controller';
import { ReportsService, SalesExportService } from './reports.service';

@Module({
  controllers: [ReportsController],
  providers: [ReportsService, SalesExportService],
})
export class ReportsModule {}
