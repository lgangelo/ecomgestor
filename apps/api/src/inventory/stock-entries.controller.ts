import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { PERMISSIONS } from '@ecommerce-manager/shared';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/types/authenticated-user';
import { AuditService } from '../audit/audit.service';
import { StockEntriesService } from './stock-entries.service';
import { CreateStockEntryDto } from './dto/create-stock-entry.dto';
import { QueryStockEntriesDto } from './dto/query-stock-entries.dto';

@Controller('stock-entries')
export class StockEntriesController {
  constructor(
    private readonly stockEntriesService: StockEntriesService,
    private readonly auditService: AuditService,
  ) {}

  @Get()
  @RequirePermissions(PERMISSIONS.INVENTORY_READ)
  findAll(@CurrentUser() user: AuthenticatedUser, @Query() query: QueryStockEntriesDto) {
    return this.stockEntriesService.findAll(user.companyId, query);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.INVENTORY_READ)
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.stockEntriesService.findOne(id, user.companyId);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.INVENTORY_ADJUST)
  async create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateStockEntryDto) {
    const entry = await this.stockEntriesService.create(user.companyId, user.userId, dto);
    await this.auditService.log({
      companyId: user.companyId,
      userId: user.userId,
      action: 'CREATE',
      entity: 'stock_entry',
      entityId: entry.id,
      newValue: entry,
    });
    return entry;
  }

  @Patch(':id/confirm')
  @RequirePermissions(PERMISSIONS.INVENTORY_ADJUST)
  async confirm(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    const entry = await this.stockEntriesService.confirm(id, user.companyId, user.userId);
    await this.auditService.log({
      companyId: user.companyId,
      userId: user.userId,
      action: 'UPDATE',
      entity: 'stock_entry',
      entityId: entry.id,
      newValue: entry,
    });
    return entry;
  }
}
