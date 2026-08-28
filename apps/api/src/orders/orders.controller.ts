import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { PERMISSIONS } from '@ecommerce-manager/shared';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/types/authenticated-user';
import { AuditService } from '../audit/audit.service';
import { OrdersService } from './orders.service';
import { QueryOrdersDto } from './dto/query-orders.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { CreateManualOrderDto } from './dto/create-manual-order.dto';

@Controller('orders')
export class OrdersController {
  constructor(
    private readonly ordersService: OrdersService,
    private readonly auditService: AuditService,
  ) {}

  @Get()
  @RequirePermissions(PERMISSIONS.ORDER_READ)
  findAll(@CurrentUser() user: AuthenticatedUser, @Query() query: QueryOrdersDto) {
    return this.ordersService.findAll(user.companyId, query);
  }

  @Post('manual')
  @RequirePermissions(PERMISSIONS.ORDER_CREATE)
  async createManual(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateManualOrderDto) {
    const order = await this.ordersService.createManualSale(user.companyId, user.userId, dto);
    await this.auditService.log({
      companyId: user.companyId,
      userId: user.userId,
      action: 'CREATE',
      entity: 'order',
      entityId: order.id,
      newValue: order,
    });
    return order;
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.ORDER_READ)
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.ordersService.findOne(id, user.companyId);
  }

  @Patch(':id/status')
  @RequirePermissions(PERMISSIONS.ORDER_UPDATE)
  async updateStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateOrderStatusDto,
  ) {
    const { old: oldValue, updated } = await this.ordersService.updateStatus(
      id,
      user.companyId,
      user.userId,
      dto,
    );
    await this.auditService.log({
      companyId: user.companyId,
      userId: user.userId,
      action: 'UPDATE',
      entity: 'order',
      entityId: updated.id,
      oldValue,
      newValue: updated,
    });
    return updated;
  }
}
