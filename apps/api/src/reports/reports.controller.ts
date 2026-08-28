import { Controller, Get, Query } from '@nestjs/common';
import { PERMISSIONS } from '@ecommerce-manager/shared';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/types/authenticated-user';
import { ReportsService } from './reports.service';
import { DashboardQueryDto } from './dto/dashboard-query.dto';

@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('dashboard')
  @RequirePermissions(PERMISSIONS.REPORT_READ)
  getDashboard(@CurrentUser() user: AuthenticatedUser, @Query() query: DashboardQueryDto) {
    return this.reportsService.getDashboard(user.companyId, query);
  }
}
