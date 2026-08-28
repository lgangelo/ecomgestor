import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { PERMISSIONS } from '@ecommerce-manager/shared';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/types/authenticated-user';
import { AuditService } from '../audit/audit.service';
import { InventoryService } from './inventory.service';
import { QueryInventoryDto } from './dto/query-inventory.dto';
import { QueryMovementsDto } from './dto/query-movements.dto';
import { CreateMovementDto } from './dto/create-movement.dto';

@Controller('inventory')
export class InventoryController {
  constructor(
    private readonly inventoryService: InventoryService,
    private readonly auditService: AuditService,
  ) {}

  @Get()
  @RequirePermissions(PERMISSIONS.INVENTORY_READ)
  findAll(@CurrentUser() user: AuthenticatedUser, @Query() query: QueryInventoryDto) {
    return this.inventoryService.findAll(user.companyId, query);
  }

  @Get('summary')
  @RequirePermissions(PERMISSIONS.INVENTORY_READ)
  getSummary(@CurrentUser() user: AuthenticatedUser) {
    return this.inventoryService.getSummary(user.companyId);
  }

  @Get('movements')
  @RequirePermissions(PERMISSIONS.INVENTORY_READ)
  listMovements(@CurrentUser() user: AuthenticatedUser, @Query() query: QueryMovementsDto) {
    return this.inventoryService.listMovements(user.companyId, query);
  }

  @Post('movements')
  @RequirePermissions(PERMISSIONS.INVENTORY_ADJUST)
  async createMovement(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateMovementDto) {
    const { movement, inventory } = await this.inventoryService.createMovement(
      user.companyId,
      user.userId,
      dto,
    );
    await this.auditService.log({
      companyId: user.companyId,
      userId: user.userId,
      action: 'ADJUST',
      entity: 'inventory',
      entityId: inventory.variantId,
      newValue: { movement, inventory },
    });
    return { movement, inventory };
  }
}
