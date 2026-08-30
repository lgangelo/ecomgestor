import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { PERMISSIONS } from '@ecommerce-manager/shared';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/types/authenticated-user';
import { AuditService } from '../audit/audit.service';
import { ProductsService } from './products.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { QueryProductDto } from './dto/query-product.dto';
import { CreateVariantDto } from './dto/create-variant.dto';
import { UpdateVariantDto } from './dto/update-variant.dto';
import { CreateCostHistoryDto } from './dto/create-cost-history.dto';
import { BulkDeleteProductsDto } from './dto/bulk-delete-products.dto';

@Controller('products')
export class ProductsController {
  constructor(
    private readonly productsService: ProductsService,
    private readonly auditService: AuditService,
  ) {}

  @Get()
  @RequirePermissions(PERMISSIONS.PRODUCT_READ)
  findAll(@CurrentUser() user: AuthenticatedUser, @Query() query: QueryProductDto) {
    return this.productsService.findAll(user.companyId, query);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.PRODUCT_READ)
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.productsService.findOne(id, user.companyId);
  }

  @Get(':id/summary')
  @RequirePermissions(PERMISSIONS.PRODUCT_READ)
  getSummary(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.productsService.getSummary(id, user.companyId);
  }

  @Get(':id/movements')
  @RequirePermissions(PERMISSIONS.PRODUCT_READ)
  getMovements(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.productsService.getMovements(id, user.companyId);
  }

  @Get(':id/cost-history')
  @RequirePermissions(PERMISSIONS.PRODUCT_READ)
  getAllCostHistory(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.productsService.getAllCostHistory(id, user.companyId);
  }

  @Get(':id/channels')
  @RequirePermissions(PERMISSIONS.PRODUCT_READ)
  getChannelMappings(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.productsService.getChannelMappings(id, user.companyId);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.PRODUCT_CREATE)
  async create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateProductDto) {
    const product = await this.productsService.create(user.companyId, dto);
    await this.auditService.log({
      companyId: user.companyId,
      userId: user.userId,
      action: 'CREATE',
      entity: 'product',
      entityId: product.id,
      newValue: product,
    });
    return product;
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.PRODUCT_UPDATE)
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateProductDto,
  ) {
    const { old: oldValue, updated } = await this.productsService.update(id, user.companyId, dto);
    await this.auditService.log({
      companyId: user.companyId,
      userId: user.userId,
      action: 'UPDATE',
      entity: 'product',
      entityId: updated.id,
      oldValue,
      newValue: updated,
    });
    return updated;
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermissions(PERMISSIONS.PRODUCT_DELETE)
  async remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    const removed = await this.productsService.remove(id, user.companyId);
    await this.auditService.log({
      companyId: user.companyId,
      userId: user.userId,
      action: 'DELETE',
      entity: 'product',
      entityId: id,
      oldValue: removed,
    });
  }

  /** Exclusão em massa — mesma regra de segurança do DELETE individual, aplicada a cada produto
   * independentemente (um com histórico real nunca aborta os demais). */
  @Post('bulk-delete')
  @RequirePermissions(PERMISSIONS.PRODUCT_DELETE)
  async removeMany(@CurrentUser() user: AuthenticatedUser, @Body() dto: BulkDeleteProductsDto) {
    const result = await this.productsService.removeMany(dto.ids, user.companyId);
    await this.auditService.log({
      companyId: user.companyId,
      userId: user.userId,
      action: 'BULK_DELETE',
      entity: 'product',
      newValue: { deletedIds: result.deleted, failed: result.failed },
    });
    return result;
  }

  @Post(':id/variants')
  @RequirePermissions(PERMISSIONS.PRODUCT_CREATE)
  async createVariant(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') productId: string,
    @Body() dto: CreateVariantDto,
  ) {
    const variant = await this.productsService.createVariant(productId, user.companyId, dto);
    await this.auditService.log({
      companyId: user.companyId,
      userId: user.userId,
      action: 'CREATE',
      entity: 'product_variant',
      entityId: variant.id,
      newValue: variant,
    });
    return variant;
  }

  @Patch('variants/:variantId')
  @RequirePermissions(PERMISSIONS.PRODUCT_UPDATE)
  async updateVariant(
    @CurrentUser() user: AuthenticatedUser,
    @Param('variantId') variantId: string,
    @Body() dto: UpdateVariantDto,
  ) {
    const { old: oldValue, updated } = await this.productsService.updateVariant(
      variantId,
      user.companyId,
      dto,
    );
    await this.auditService.log({
      companyId: user.companyId,
      userId: user.userId,
      action: 'UPDATE',
      entity: 'product_variant',
      entityId: updated.id,
      oldValue,
      newValue: updated,
    });
    return updated;
  }

  @Get('variants/:variantId/cost-history')
  @RequirePermissions(PERMISSIONS.PRODUCT_READ)
  getCostHistory(@CurrentUser() user: AuthenticatedUser, @Param('variantId') variantId: string) {
    return this.productsService.getCostHistory(variantId, user.companyId);
  }

  @Post('variants/:variantId/cost-history')
  @RequirePermissions(PERMISSIONS.PRODUCT_UPDATE)
  async createCostHistory(
    @CurrentUser() user: AuthenticatedUser,
    @Param('variantId') variantId: string,
    @Body() dto: CreateCostHistoryDto,
  ) {
    const entry = await this.productsService.createCostHistory(variantId, user.companyId, dto);
    await this.auditService.log({
      companyId: user.companyId,
      userId: user.userId,
      action: 'CREATE',
      entity: 'product_cost_history',
      entityId: entry.id,
      newValue: entry,
    });
    return entry;
  }
}
