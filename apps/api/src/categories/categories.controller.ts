import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { PERMISSIONS } from '@ecommerce-manager/shared';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/types/authenticated-user';
import { AuditService } from '../audit/audit.service';
import { CategoriesService } from './categories.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { QueryCategoryDto } from './dto/query-category.dto';

@Controller('categories')
export class CategoriesController {
  constructor(
    private readonly categoriesService: CategoriesService,
    private readonly auditService: AuditService,
  ) {}

  @Get()
  @RequirePermissions(PERMISSIONS.PRODUCT_READ)
  findAll(@CurrentUser() user: AuthenticatedUser, @Query() query: QueryCategoryDto) {
    return this.categoriesService.findAll(user.companyId, query);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.PRODUCT_CREATE)
  async create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateCategoryDto) {
    const category = await this.categoriesService.create(user.companyId, dto);
    await this.auditService.log({
      companyId: user.companyId,
      userId: user.userId,
      action: 'CREATE',
      entity: 'category',
      entityId: category.id,
      newValue: category,
    });
    return category;
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.PRODUCT_UPDATE)
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateCategoryDto,
  ) {
    const { old: oldValue, updated } = await this.categoriesService.update(
      id,
      user.companyId,
      dto,
    );
    await this.auditService.log({
      companyId: user.companyId,
      userId: user.userId,
      action: 'UPDATE',
      entity: 'category',
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
    const removed = await this.categoriesService.remove(id, user.companyId);
    await this.auditService.log({
      companyId: user.companyId,
      userId: user.userId,
      action: 'DELETE',
      entity: 'category',
      entityId: id,
      oldValue: removed,
    });
  }
}
