import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { existsSync } from 'node:fs';
import { resolve as resolvePath } from 'node:path';
import { PERMISSIONS } from '@ecommerce-manager/shared';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/types/authenticated-user';
import { AuditService } from '../audit/audit.service';
import { ProductsService, UploadedImageFile } from './products.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { QueryProductDto } from './dto/query-product.dto';
import { CreateVariantDto } from './dto/create-variant.dto';
import { UpdateVariantDto } from './dto/update-variant.dto';
import { CreateCostHistoryDto } from './dto/create-cost-history.dto';
import { BulkDeleteProductsDto } from './dto/bulk-delete-products.dto';
import { BulkUpdateProductStatusDto } from './dto/bulk-update-product-status.dto';

// Nome gerado por `ProductsService.saveImageFile` (`randomUUID() + extensão`) — nunca aceita
// nada fora desse formato no path da requisição (trava tentativa de path traversal, ex.: `../..`).
const IMAGE_FILENAME_PATTERN = /^[0-9a-f-]+\.(jpg|png|webp)$/;
// Mesma trava de path traversal, pro nome gerado por `ProductsService.saveVideoFile`
// (`sanitizeSlug(baseSku)` ou `randomUUID()` + extensão — por isso aceita letras maiúsculas/
// underscore também, ao contrário do padrão de foto acima).
const VIDEO_FILENAME_PATTERN = /^[0-9a-zA-Z_-]+\.(mp4|mov|webm)$/;

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

  /** Registra o mesmo custo para todas as variações do produto de uma vez (seção pedida pelo
   * usuário) — quando o custo varia por variação, o operador continua usando o registro
   * individual em `POST variants/:variantId/cost-history`. */
  @Post(':id/cost-history')
  @RequirePermissions(PERMISSIONS.PRODUCT_UPDATE)
  async createCostHistoryForAllVariants(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: CreateCostHistoryDto,
  ) {
    const entries = await this.productsService.createCostHistoryForAllVariants(id, user.companyId, dto);
    await this.auditService.log({
      companyId: user.companyId,
      userId: user.userId,
      action: 'CREATE',
      entity: 'product_cost_history',
      entityId: id,
      newValue: { productId: id, cost: dto.cost, variantsAffected: entries.length },
    });
    return entries;
  }

  @Get(':id/channels')
  @RequirePermissions(PERMISSIONS.PRODUCT_READ)
  getChannelMappings(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.productsService.getChannelMappings(id, user.companyId);
  }

  /** Serve a foto salva localmente (capa do produto ou de uma variação) — nunca as importadas de
   * um canal externo (ex.: TikTok), essas continuam sendo a URL do CDN deles direto.
   * `companyId` no path (não vem de `@CurrentUser`) só para checar, antes de ler o arquivo, que o
   * usuário autenticado pertence à MESMA empresa dona da foto — nunca serve a foto de outra
   * empresa mesmo que o nome do arquivo seja adivinhado. */
  @Get('images/:companyId/:filename')
  @RequirePermissions(PERMISSIONS.PRODUCT_READ)
  getImage(
    @CurrentUser() user: AuthenticatedUser,
    @Param('companyId') companyId: string,
    @Param('filename') filename: string,
    @Res() res: Response,
  ) {
    if (companyId !== user.companyId) throw new NotFoundException('Imagem não encontrada');
    if (!IMAGE_FILENAME_PATTERN.test(filename)) throw new BadRequestException('Nome de arquivo inválido');

    const path = resolvePath(this.productsService.resolveImageFilePath(companyId, filename));
    if (!existsSync(path)) throw new NotFoundException('Imagem não encontrada');
    res.sendFile(path);
  }

  /** Mesma ideia de `getImage`, pro vídeo do produto. */
  @Get('videos/:companyId/:filename')
  @RequirePermissions(PERMISSIONS.PRODUCT_READ)
  getVideo(
    @CurrentUser() user: AuthenticatedUser,
    @Param('companyId') companyId: string,
    @Param('filename') filename: string,
    @Res() res: Response,
  ) {
    if (companyId !== user.companyId) throw new NotFoundException('Vídeo não encontrado');
    if (!VIDEO_FILENAME_PATTERN.test(filename)) throw new BadRequestException('Nome de arquivo inválido');

    const path = resolvePath(this.productsService.resolveVideoFilePath(companyId, filename));
    if (!existsSync(path)) throw new NotFoundException('Vídeo não encontrado');
    res.sendFile(path);
  }

  @Post(':id/video')
  @RequirePermissions(PERMISSIONS.PRODUCT_UPDATE)
  @UseInterceptors(FileInterceptor('file'))
  async uploadVideo(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @UploadedFile() file: UploadedImageFile,
  ) {
    const updated = await this.productsService.uploadProductVideo(id, user.companyId, file);
    await this.auditService.log({
      companyId: user.companyId,
      userId: user.userId,
      action: 'UPDATE',
      entity: 'product',
      entityId: updated.id,
      newValue: { videoUrl: updated.videoUrl },
    });
    return updated;
  }

  @Delete(':id/video')
  @HttpCode(204)
  @RequirePermissions(PERMISSIONS.PRODUCT_UPDATE)
  async removeVideo(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    await this.productsService.removeProductVideo(id, user.companyId);
    await this.auditService.log({
      companyId: user.companyId,
      userId: user.userId,
      action: 'UPDATE',
      entity: 'product',
      entityId: id,
      newValue: { videoUrl: null },
    });
  }

  @Post(':id/image')
  @RequirePermissions(PERMISSIONS.PRODUCT_UPDATE)
  @UseInterceptors(FileInterceptor('file'))
  async uploadImage(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @UploadedFile() file: UploadedImageFile,
  ) {
    const updated = await this.productsService.uploadProductImage(id, user.companyId, file);
    await this.auditService.log({
      companyId: user.companyId,
      userId: user.userId,
      action: 'UPDATE',
      entity: 'product',
      entityId: updated.id,
      newValue: { imageUrl: updated.imageUrl },
    });
    return updated;
  }

  @Post(':id/images')
  @RequirePermissions(PERMISSIONS.PRODUCT_UPDATE)
  @UseInterceptors(FileInterceptor('file'))
  async addImage(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @UploadedFile() file: UploadedImageFile,
  ) {
    const image = await this.productsService.addProductImage(id, user.companyId, file);
    await this.auditService.log({
      companyId: user.companyId,
      userId: user.userId,
      action: 'UPDATE',
      entity: 'product',
      entityId: id,
      newValue: { imageAdded: image.url },
    });
    return image;
  }

  @Delete(':id/images/:imageId')
  @HttpCode(204)
  @RequirePermissions(PERMISSIONS.PRODUCT_UPDATE)
  async removeImage(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('imageId') imageId: string,
  ) {
    await this.productsService.removeProductImage(id, imageId, user.companyId);
    await this.auditService.log({
      companyId: user.companyId,
      userId: user.userId,
      action: 'UPDATE',
      entity: 'product',
      entityId: id,
      newValue: { imageRemoved: imageId },
    });
  }

  @Post(':id/images/:imageId/cover')
  @RequirePermissions(PERMISSIONS.PRODUCT_UPDATE)
  async setCoverImage(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('imageId') imageId: string,
  ) {
    const updated = await this.productsService.setProductCoverImage(id, imageId, user.companyId);
    await this.auditService.log({
      companyId: user.companyId,
      userId: user.userId,
      action: 'UPDATE',
      entity: 'product',
      entityId: id,
      newValue: { imageUrl: updated.imageUrl },
    });
    return updated;
  }

  @Post('variants/:variantId/image')
  @RequirePermissions(PERMISSIONS.PRODUCT_UPDATE)
  @UseInterceptors(FileInterceptor('file'))
  async uploadVariantImage(
    @CurrentUser() user: AuthenticatedUser,
    @Param('variantId') variantId: string,
    @UploadedFile() file: UploadedImageFile,
  ) {
    const updated = await this.productsService.uploadVariantImage(variantId, user.companyId, file);
    await this.auditService.log({
      companyId: user.companyId,
      userId: user.userId,
      action: 'UPDATE',
      entity: 'product_variant',
      entityId: updated.id,
      newValue: { imageUrl: updated.imageUrl },
    });
    return updated;
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

  /** Ativação/inativação em massa (seção pedida pelo usuário) — cada produto selecionado passa a
   * ter o mesmo status; nunca bloqueia por histórico (diferente da exclusão). */
  @Post('bulk-status')
  @RequirePermissions(PERMISSIONS.PRODUCT_UPDATE)
  async updateManyStatus(@CurrentUser() user: AuthenticatedUser, @Body() dto: BulkUpdateProductStatusDto) {
    const result = await this.productsService.updateManyStatus(dto.ids, user.companyId, dto.status);
    await this.auditService.log({
      companyId: user.companyId,
      userId: user.userId,
      action: 'BULK_UPDATE_STATUS',
      entity: 'product',
      newValue: { updatedIds: result.updated, status: dto.status, notFound: result.notFound },
    });
    return result;
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
