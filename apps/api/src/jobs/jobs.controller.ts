import { Controller, Get, Param, Post, Query } from '@nestjs/common';
import { PERMISSIONS } from '@ecommerce-manager/shared';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/authenticated-user';
import { AuditService } from '../audit/audit.service';
import { JobsService } from './jobs.service';
import { ListJobsQueryDto } from './dto/list-jobs-query.dto';

@Controller('jobs')
export class JobsController {
  constructor(
    private readonly jobsService: JobsService,
    private readonly auditService: AuditService,
  ) {}

  @Get()
  @RequirePermissions(PERMISSIONS.INTEGRATION_JOBS_READ)
  list(@CurrentUser() user: AuthenticatedUser, @Query() query: ListJobsQueryDto) {
    return this.jobsService.list(user.companyId, query);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.INTEGRATION_JOBS_READ)
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.jobsService.findOne(user.companyId, id);
  }

  /** Retry manual exige permissão própria e é sempre auditado (seção 48 da Fase 4). */
  @Post(':id/retry')
  @RequirePermissions(PERMISSIONS.INTEGRATION_JOBS_RETRY)
  async retry(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    const job = await this.jobsService.retry(user.companyId, user, id);
    await this.auditService.log({
      companyId: user.companyId,
      userId: user.userId,
      action: 'RETRY',
      entity: 'sync_job',
      entityId: id,
      newValue: job,
    });
    return job;
  }
}
