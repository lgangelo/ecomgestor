import { Body, Controller, Get, Post } from '@nestjs/common';
import { PERMISSIONS } from '@ecommerce-manager/shared';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/types/authenticated-user';
import { AuditService } from '../audit/audit.service';
import { SuppliersService } from './suppliers.service';
import { CreateSupplierDto } from './dto/create-supplier.dto';

@Controller('suppliers')
export class SuppliersController {
  constructor(
    private readonly suppliersService: SuppliersService,
    private readonly auditService: AuditService,
  ) {}

  @Get()
  @RequirePermissions(PERMISSIONS.INVENTORY_READ)
  findAll(@CurrentUser() user: AuthenticatedUser) {
    return this.suppliersService.findAll(user.companyId);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.INVENTORY_ADJUST)
  async create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateSupplierDto) {
    const supplier = await this.suppliersService.create(user.companyId, dto);
    await this.auditService.log({
      companyId: user.companyId,
      userId: user.userId,
      action: 'CREATE',
      entity: 'supplier',
      entityId: supplier.id,
      newValue: supplier,
    });
    return supplier;
  }
}
