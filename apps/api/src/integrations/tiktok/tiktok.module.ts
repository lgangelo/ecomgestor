import { Module } from '@nestjs/common';
import { AuditModule } from '../../audit/audit.module';
import { OrdersModule } from '../../orders/orders.module';
import { ReturnsModule } from '../../returns/returns.module';
import { InventoryModule } from '../../inventory/inventory.module';
import { ProductsModule } from '../../products/products.module';
import { TikTokCredentialsService } from './tiktok-credentials.service';
import { TikTokTokenRefreshService } from './tiktok-token-refresh.service';
import { TikTokConnectorFactory } from './tiktok-connector.factory';
import { TikTokOAuthService } from './tiktok-oauth.service';
import { TikTokOAuthController } from './tiktok-oauth.controller';
import { TikTokWebhookService } from './tiktok-webhook.service';
import { TikTokWebhookController } from './tiktok-webhook.controller';
import { TikTokProductsSyncService } from './tiktok-products-sync.service';
import { TikTokOrdersSyncService } from './tiktok-orders-sync.service';
import { TikTokInventorySyncService } from './tiktok-inventory-sync.service';
import { TikTokFinanceSyncService } from './tiktok-finance-sync.service';
import { TikTokReturnsSyncService } from './tiktok-returns-sync.service';
import { TikTokJobsService } from './tiktok-jobs.service';
import { TikTokHealthService } from './tiktok-health.service';
import { TikTokWebhookProcessorService } from './tiktok-webhook-processor.service';
import { TikTokStockOutboxService } from './tiktok-stock-outbox.service';
import { TikTokController } from './tiktok.controller';
import { TikTokQueueService } from '../../queue/tiktok-queue.service';

/**
 * Módulo da integração TikTok Shop (Fase 3). Importa OrdersModule/ReturnsModule para reusar o
 * domínio existente (`OrdersService`/`ReturnsService`) em vez de duplicar regras de negócio —
 * a integração nunca decide sozinha uma transição de estoque ou de status de pedido.
 *
 * Importado tanto por `AppModule` (processo da API) quanto por `WorkerModule` (processo do
 * worker BullMQ) — são duas árvores de DI/processos independentes. Por isso o scheduler do
 * outbox de estoque (`TikTokStockOutboxSchedulerService`) NÃO mora aqui: um provider com
 * `@Cron` dentro deste módulo rodaria em dobro, uma vez por processo (bug real encontrado na
 * primeira tentativa de deploy — ver `tiktok-stock-outbox-scheduler.module.ts`, importado só
 * pelo `AppModule`).
 */
@Module({
  imports: [AuditModule, OrdersModule, ReturnsModule, InventoryModule, ProductsModule],
  controllers: [TikTokOAuthController, TikTokWebhookController, TikTokController],
  providers: [
    TikTokCredentialsService,
    TikTokTokenRefreshService,
    TikTokConnectorFactory,
    TikTokOAuthService,
    TikTokWebhookService,
    TikTokProductsSyncService,
    TikTokOrdersSyncService,
    TikTokInventorySyncService,
    TikTokFinanceSyncService,
    TikTokReturnsSyncService,
    TikTokJobsService,
    TikTokHealthService,
    TikTokWebhookProcessorService,
    TikTokStockOutboxService,
    TikTokQueueService,
  ],
  exports: [
    TikTokCredentialsService,
    TikTokTokenRefreshService,
    TikTokConnectorFactory,
    TikTokProductsSyncService,
    TikTokOrdersSyncService,
    TikTokInventorySyncService,
    TikTokFinanceSyncService,
    TikTokReturnsSyncService,
    TikTokJobsService,
    TikTokWebhookProcessorService,
    TikTokStockOutboxService,
    TikTokQueueService,
  ],
})
export class TikTokModule {}
