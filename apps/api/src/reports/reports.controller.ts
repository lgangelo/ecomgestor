import { Controller, Get, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { PERMISSIONS } from '@ecommerce-manager/shared';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/types/authenticated-user';
import { ReportsService, SalesExportService } from './reports.service';
import { DashboardQueryDto } from './dto/dashboard-query.dto';

@Controller('reports')
export class ReportsController {
  constructor(
    private readonly reportsService: ReportsService,
    private readonly salesExportService: SalesExportService,
  ) {}

  @Get('dashboard')
  @RequirePermissions(PERMISSIONS.REPORT_READ)
  getDashboard(@CurrentUser() user: AuthenticatedUser, @Query() query: DashboardQueryDto) {
    return this.reportsService.getDashboard(user.companyId, query);
  }

  @Get('sales-export')
  @RequirePermissions(PERMISSIONS.REPORT_READ)
  async exportSales(
    @CurrentUser() user: AuthenticatedUser,
    @Query('dateFrom') dateFrom: string | undefined,
    @Query('dateTo') dateTo: string | undefined,
    @Res() res: Response,
  ) {
    const csv = await this.salesExportService.buildSalesCsv(user.companyId, dateFrom, dateTo);
    res.set({
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="vendas.csv"',
    });
    res.send(csv);
  }
}
