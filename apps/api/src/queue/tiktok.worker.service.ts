import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job, Worker } from 'bullmq';
import Redis from 'ioredis';
import { PrismaService } from '../common/prisma/prisma.service';
import { AppLoggerService } from '../common/logger/app-logger.service';
import { IntegrationProvider } from '@ecommerce-manager/database';
import { TikTokJobsService } from '../integrations/tiktok/tiktok-jobs.service';
import { TikTokProductsSyncService } from '../integrations/tiktok/tiktok-products-sync.service';
import { TikTokOrdersSyncService } from '../integrations/tiktok/tiktok-orders-sync.service';
import { TikTokInventorySyncService } from '../integrations/tiktok/tiktok-inventory-sync.service';
import { TikTokFinanceSyncService } from '../integrations/tiktok/tiktok-finance-sync.service';
import { TikTokReturnsSyncService } from '../integrations/tiktok/tiktok-returns-sync.service';
import { TikTokWebhookProcessorService } from '../integrations/tiktok/tiktok-webhook-processor.service';
import {
  ImportOrdersJobData,
  ImportProductsJobData,
  ProcessWebhookJobData,
  PushInventoryJobData,
  ReconcileOrdersJobData,
  SyncFinanceJobData,
  SyncReturnsJobData,
} from './tiktok-queue.service';
import { INTEGRATION_JOBS, INTEGRATION_QUEUE } from './tiktok-queue.constants';

const MAX_ATTEMPTS = 5;

/**
 * Consumidor da fila `integration` (seção 51 — nomeada, separada de `housekeeping`). Cada job
 * é executado através de `TikTokJobsService.withTracking`, que decide por categoria de erro se
 * o BullMQ deve tentar de novo (rate limit/erro temporário) ou parar (auth/validação/erro
 * definitivo) — nunca retry infinito (seção 25).
 */
@Injectable()
export class TikTokWorkerService implements OnModuleInit, OnModuleDestroy {
  private worker?: Worker;
  private connection?: Redis;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly logger: AppLoggerService,
    private readonly jobsService: TikTokJobsService,
    private readonly productsSync: TikTokProductsSyncService,
    private readonly ordersSync: TikTokOrdersSyncService,
    private readonly inventorySync: TikTokInventorySyncService,
    private readonly financeSync: TikTokFinanceSyncService,
    private readonly returnsSync: TikTokReturnsSyncService,
    private readonly webhookProcessor: TikTokWebhookProcessorService,
  ) {
    this.logger.setContext('TikTokWorker');
  }

  onModuleInit() {
    this.connection = new Redis(this.configService.get<string>('redisUrl')!, { maxRetriesPerRequest: null });
    this.worker = new Worker(INTEGRATION_QUEUE, (job) => this.process(job), { connection: this.connection });

    this.worker.on('completed', (job) => this.logger.log('job_completed', { operation: job.name }));
    this.worker.on('failed', (job, err) =>
      this.logger.error('job_failed', { operation: job?.name, errorMessage: err.message }),
    );
  }

  private async integrationIdFor(companyId: string): Promise<string | null> {
    const integration = await this.prisma.client.integration.findUnique({
      where: { companyId_provider: { companyId, provider: IntegrationProvider.TIKTOK_SHOP } },
    });
    return integration?.id ?? null;
  }

  private async process(job: Job): Promise<void> {
    switch (job.name) {
      case INTEGRATION_JOBS.IMPORT_PRODUCTS: {
        const data = job.data as ImportProductsJobData;
        return this.runTracked(job, data.companyId, undefined, () => this.productsSync.runProductsCheck(data.companyId));
      }
      case INTEGRATION_JOBS.IMPORT_ORDERS: {
        const data = job.data as ImportOrdersJobData;
        const since = data.ordersSince ? new Date(data.ordersSince) : undefined;
        return this.runTracked(job, data.companyId, undefined, () =>
          this.ordersSync.syncOrders(data.companyId, data.userId, since),
        );
      }
      case INTEGRATION_JOBS.PROCESS_WEBHOOK: {
        const data = job.data as ProcessWebhookJobData;
        const event = await this.prisma.client.webhookEvent.findUnique({ where: { id: data.webhookEventId } });
        if (!event) return;
        const integration = await this.prisma.client.integration.findUnique({ where: { id: event.integrationId } });
        return this.runTracked(job, integration?.companyId, data.webhookEventId, () =>
          this.webhookProcessor.process(data.webhookEventId),
        );
      }
      case INTEGRATION_JOBS.RECONCILE_ORDERS: {
        const data = job.data as ReconcileOrdersJobData;
        return this.runTracked(job, data.companyId, undefined, () => this.ordersSync.syncOrders(data.companyId, null));
      }
      case INTEGRATION_JOBS.SYNC_FINANCE: {
        const data = job.data as SyncFinanceJobData;
        return this.runTracked(job, data.companyId, undefined, () => this.financeSync.syncStatements(data.companyId));
      }
      case INTEGRATION_JOBS.SYNC_RETURNS: {
        const data = job.data as SyncReturnsJobData;
        return this.runTracked(job, data.companyId, undefined, () => this.returnsSync.syncReturns(data.companyId));
      }
      case INTEGRATION_JOBS.PUSH_INVENTORY: {
        const data = job.data as PushInventoryJobData;
        return this.runTracked(job, data.companyId, data.variantId, () =>
          this.inventorySync.push(data.companyId, data.userId, data.variantId),
        );
      }
      default:
        this.logger.warn('unknown_job', { operation: job.name });
    }
  }

  private async runTracked<T>(
    job: Job,
    companyId: string | undefined,
    relatedExternalId: string | undefined,
    fn: () => Promise<T>,
  ): Promise<void> {
    if (!companyId) return;
    const integrationId = await this.integrationIdFor(companyId);
    if (!integrationId) return;

    await this.jobsService.withTracking(
      {
        integrationId,
        type: job.name,
        relatedExternalId,
        payload: job.data,
        attemptNumber: job.attemptsMade + 1,
        maxAttempts: MAX_ATTEMPTS,
      },
      fn,
    );
  }

  async onModuleDestroy() {
    await this.worker?.close();
    this.connection?.disconnect();
  }
}
