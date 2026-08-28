import { Body, Controller, Param, Post } from '@nestjs/common';
import { PERMISSIONS } from '@ecommerce-manager/shared';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/types/authenticated-user';
import { AuditService } from '../audit/audit.service';
import { ReturnsService } from './returns.service';
import { CreateReturnDto } from './dto/create-return.dto';

/** Endpoint aninhado em /orders/:orderId/returns — mantido junto do módulo de devoluções. */
@Controller('orders')
export class OrderReturnsController {
  constructor(
    private readonly returnsService: ReturnsService,
    private readonly auditService: AuditService,
  ) {}

  @Post(':orderId/returns')
  @RequirePermissions(PERMISSIONS.ORDER_UPDATE)
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('orderId') orderId: string,
    @Body() dto: CreateReturnDto,
  ) {
    const ret = await this.returnsService.create(orderId, user.companyId, user.userId, dto);
    await this.auditService.log({
      companyId: user.companyId,
      userId: user.userId,
      action: 'CREATE',
      entity: 'return',
      entityId: ret.id,
      newValue: ret,
    });
    return ret;
  }
}
