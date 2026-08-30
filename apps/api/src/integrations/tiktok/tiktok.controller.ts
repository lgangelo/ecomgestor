import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { PERMISSIONS } from '@ecommerce-manager/shared';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../auth/types/authenticated-user';
import { OrdersService } from '../../orders/orders.service';
import { TikTokQueueService } from '../../queue/tiktok-queue.service';
import { TikTokHealthService } from './tiktok-health.service';
import { TikTokProductsSyncService } from './tiktok-products-sync.service';
import { TikTokInventorySyncService } from './tiktok-inventory-sync.service';
import { TikTokFinanceSyncService } from './tiktok-finance-sync.service';
import { TikTokJobsService } from './tiktok-jobs.service';
import { TikTokStockOutboxService } from './tiktok-stock-outbox.service';
import { LinkTikTokProductDto } from './dto/link-tiktok-product.dto';
import { IgnoreTikTokProductDto } from './dto/ignore-tiktok-product.dto';
import { CreateTikTokProductDto } from './dto/create-tiktok-product.dto';
import { BulkCreateTikTokProductsDto } from './dto/bulk-create-tiktok-products.dto';
import { StartTikTokImportDto } from './dto/start-tiktok-import.dto';
import { PushTikTokInventoryDto } from './dto/push-tiktok-inventory.dto';

@Controller('integrations/tiktok')
export class TikTokController {
  constructor(
    private readonly health: TikTokHealthService,
    private readonly productsSync: TikTokProductsSyncService,
    private readonly inventorySync: TikTokInventorySyncService,
    private readonly financeSync: TikTokFinanceSyncService,
    private readonly jobsService: TikTokJobsService,
    private readonly stockOutbox: TikTokStockOutboxService,
    private readonly ordersService: OrdersService,
    private readonly queue: TikTokQueueService,
  ) {}

  @Get('status')
  @RequirePermissions(PERMISSIONS.INTEGRATION_TIKTOK_READ)
  getStatus(@CurrentUser() user: AuthenticatedUser) {
    return this.health.getStatus(user.companyId);
  }

  @Get('products/unmatched')
  @RequirePermissions(PERMISSIONS.INTEGRATION_TIKTOK_READ)
  listUnmatchedProducts(@CurrentUser() user: AuthenticatedUser) {
    return this.productsSync.listUnmatched(user.companyId);
  }

  @Post('products/link')
  @RequirePermissions(PERMISSIONS.INTEGRATION_TIKTOK_SYNC)
  linkProduct(@CurrentUser() user: AuthenticatedUser, @Body() dto: LinkTikTokProductDto) {
    return this.productsSync.link(user.companyId, user.userId, dto.externalSku, dto.externalProductId, dto.variantId);
  }

  @Post('products/ignore')
  @RequirePermissions(PERMISSIONS.INTEGRATION_TIKTOK_SYNC)
  ignoreProduct(@CurrentUser() user: AuthenticatedUser, @Body() dto: IgnoreTikTokProductDto) {
    return this.productsSync.ignore(user.companyId, user.userId, dto.externalSku, dto.externalProductId);
  }

  @Post('products/create')
  @RequirePermissions(PERMISSIONS.INTEGRATION_TIKTOK_SYNC)
  createProduct(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateTikTokProductDto) {
    return this.productsSync.createInternalProduct(user.companyId, user.userId, dto.externalSku, dto.externalProductId, {
      name: dto.name,
      sku: dto.sku,
      price: dto.price,
      stock: dto.stock,
      imageUrl: dto.imageUrl,
      color: dto.color,
      size: dto.size,
    });
  }

  /** Criação em lote — carga inicial de catálogos grandes (seção 10). */
  @Post('products/bulk-create')
  @RequirePermissions(PERMISSIONS.INTEGRATION_TIKTOK_SYNC)
  bulkCreateProducts(@CurrentUser() user: AuthenticatedUser, @Body() dto: BulkCreateTikTokProductsDto) {
    return this.productsSync.createInternalProductsBulk(user.companyId, user.userId, dto.items);
  }

  /** Atualiza (nunca cria) preço/estoque dos produtos já vinculados, usando o SKU externo já
   * gravado no vínculo como chave — seção 10. */
  @Post('products/sync-linked')
  @RequirePermissions(PERMISSIONS.INTEGRATION_TIKTOK_SYNC)
  syncLinkedProducts(@CurrentUser() user: AuthenticatedUser) {
    return this.productsSync.syncLinkedProducts(user.companyId, user.userId);
  }

  /** Wizard de importação inicial (seção 9) — enfileira e retorna na hora, nunca bloqueia. */
  @Post('import')
  @RequirePermissions(PERMISSIONS.INTEGRATION_TIKTOK_SYNC)
  async startImport(@CurrentUser() user: AuthenticatedUser, @Body() dto: StartTikTokImportDto) {
    if (dto.importProducts) {
      await this.queue.enqueueImportProducts({ companyId: user.companyId });
    }
    if (dto.importOrders) {
      await this.queue.enqueueImportOrders({ companyId: user.companyId, userId: user.userId, ordersSince: dto.ordersSince });
    }
    return { enqueued: true };
  }

  /** "Sincronizar agora" (reaproveita o checkpoint já existente) — também nunca bloqueia. */
  @Post('sync')
  @RequirePermissions(PERMISSIONS.INTEGRATION_TIKTOK_SYNC)
  async syncNow(@CurrentUser() user: AuthenticatedUser) {
    await this.queue.enqueueImportOrders({ companyId: user.companyId, userId: user.userId });
    await this.queue.enqueueImportProducts({ companyId: user.companyId });
    await this.queue.enqueueSyncFinance({ companyId: user.companyId });
    await this.queue.enqueueSyncReturns({ companyId: user.companyId });
    return { enqueued: true };
  }

  @Post('orders/:orderId/reprocess')
  @RequirePermissions(PERMISSIONS.INTEGRATION_TIKTOK_SYNC)
  reprocessOrder(@CurrentUser() user: AuthenticatedUser, @Param('orderId') orderId: string) {
    return this.ordersService.reprocessOrder(orderId, user.companyId, user.userId);
  }

  @Get('orders/:orderId/reconciliation')
  @RequirePermissions(PERMISSIONS.INTEGRATION_TIKTOK_READ)
  getOrderReconciliation(@CurrentUser() user: AuthenticatedUser, @Param('orderId') orderId: string) {
    return this.financeSync.getOrderReconciliation(user.companyId, orderId);
  }

  /** Seção 54 da Fase 4 — status inclui PENDENTE/ERRO vindos do outbox, não só OK/DIVERGENTE. */
  @Get('inventory/compare')
  @RequirePermissions(PERMISSIONS.INTEGRATION_INVENTORY_COMPARE)
  compareInventory(@CurrentUser() user: AuthenticatedUser) {
    return this.stockOutbox.getStatusReport(user.companyId);
  }

  @Get('inventory/push-enabled')
  @RequirePermissions(PERMISSIONS.INTEGRATION_INVENTORY_COMPARE)
  isPushEnabled() {
    return { enabled: this.inventorySync.isPushEnabled() };
  }

  @Post('inventory/push')
  @RequirePermissions(PERMISSIONS.INTEGRATION_INVENTORY_PUSH)
  pushInventory(@CurrentUser() user: AuthenticatedUser, @Body() dto: PushTikTokInventoryDto) {
    return this.inventorySync.push(user.companyId, user.userId, dto.variantId);
  }

  @Get('jobs')
  @RequirePermissions(PERMISSIONS.INTEGRATION_JOBS_READ)
  listFailedJobs(@CurrentUser() user: AuthenticatedUser) {
    return this.jobsService.listFailures(user.companyId);
  }

  @Post('jobs/:id/retry')
  @RequirePermissions(PERMISSIONS.INTEGRATION_JOBS_RETRY)
  async retryJob(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    await this.jobsService.retryAndRequeue(id, user);
    return { requeued: true };
  }
}
