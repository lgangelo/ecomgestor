import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { PERMISSIONS } from '@ecommerce-manager/shared';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/types/authenticated-user';
import { AuditService } from '../audit/audit.service';
import { InventoryCountService } from './inventory-count.service';
import { CreateCountDto } from './dto/create-count.dto';
import { UpdateCountItemDto } from './dto/update-count-item.dto';

@Controller('inventory-counts')
export class InventoryCountController {
  constructor(
    private readonly countService: InventoryCountService,
    private readonly auditService: AuditService,
  ) {}

  @Get()
  @RequirePermissions(PERMISSIONS.INVENTORY_READ)
  findAll(@CurrentUser() user: AuthenticatedUser) {
    return this.countService.findAll(user.companyId);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.INVENTORY_READ)
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.countService.findOne(id, user.companyId);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.INVENTORY_ADJUST)
  async start(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateCountDto) {
    const count = await this.countService.start(user.companyId, user.userId, dto);
    await this.auditService.log({
      companyId: user.companyId,
      userId: user.userId,
      action: 'CREATE',
      entity: 'inventory_count',
      entityId: count.id,
      newValue: { itemCount: count.items.length },
    });
    return count;
  }

  @Patch(':id/items/:itemId')
  @RequirePermissions(PERMISSIONS.INVENTORY_ADJUST)
  updateItem(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Body() dto: UpdateCountItemDto,
  ) {
    return this.countService.updateItem(id, itemId, user.companyId, dto);
  }

  @Post(':id/complete')
  @RequirePermissions(PERMISSIONS.INVENTORY_ADJUST)
  async complete(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    const count = await this.countService.complete(id, user.companyId, user.userId);
    await this.auditService.log({
      companyId: user.companyId,
      userId: user.userId,
      action: 'UPDATE',
      entity: 'inventory_count',
      entityId: count.id,
      newValue: { status: count.status },
    });
    return count;
  }
}
