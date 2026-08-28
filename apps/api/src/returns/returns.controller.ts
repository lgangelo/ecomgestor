import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { PERMISSIONS } from '@ecommerce-manager/shared';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/types/authenticated-user';
import { AuditService } from '../audit/audit.service';
import { ReturnsService } from './returns.service';
import { QueryReturnsDto } from './dto/query-returns.dto';
import { UpdateReturnStatusDto } from './dto/update-return-status.dto';
import { CreateRefundDto } from './dto/create-refund.dto';

@Controller('returns')
export class ReturnsController {
  constructor(
    private readonly returnsService: ReturnsService,
    private readonly auditService: AuditService,
  ) {}

  @Get()
  @RequirePermissions(PERMISSIONS.ORDER_READ)
  findAll(@CurrentUser() user: AuthenticatedUser, @Query() query: QueryReturnsDto) {
    return this.returnsService.findAll(user.companyId, query);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.ORDER_READ)
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.returnsService.findOne(id, user.companyId);
  }

  @Patch(':id/status')
  @RequirePermissions(PERMISSIONS.ORDER_UPDATE)
  async updateStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateReturnStatusDto,
  ) {
    const { old: oldValue, updated } = await this.returnsService.updateStatus(id, user.companyId, dto);
    await this.auditService.log({
      companyId: user.companyId,
      userId: user.userId,
      action: 'UPDATE',
      entity: 'return',
      entityId: updated.id,
      oldValue,
      newValue: updated,
    });
    return updated;
  }

  @Post(':id/refunds')
  @RequirePermissions(PERMISSIONS.ORDER_UPDATE)
  async createRefund(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: CreateRefundDto,
  ) {
    const refund = await this.returnsService.createRefund(id, user.companyId, user.userId, dto);
    await this.auditService.log({
      companyId: user.companyId,
      userId: user.userId,
      action: 'CREATE',
      entity: 'refund',
      entityId: refund.id,
      newValue: refund,
    });
    return refund;
  }
}
