import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job, Worker } from 'bullmq';
import Redis from 'ioredis';
import { PrismaService } from '../common/prisma/prisma.service';
import { AppLoggerService } from '../common/logger/app-logger.service';
import { IntegrationProvider } from '@ecommerce-manager/database';
import { MercadoLivreJobsService } from '../integrations/mercadolivre/mercadolivre-jobs.service';
import { MercadoLivreOrdersSyncService } from '../integrations/mercadolivre/mercadolivre-orders-sync.service';
import { MercadoLivreImportOrdersJobData, MercadoLivreReconcileOrdersJobData } from './mercadolivre-queue.service';
import { MERCADO_LIVRE_JOBS, MERCADO_LIVRE_QUEUE } from './mercadolivre-queue.constants';

const MAX_ATTEMPTS = 5;

/**
 * Consumidor da fila `mercadolivre` — mesmo papel de `TikTokWorkerService`, mas numa fila própria
 * (ver comentário em `mercadolivre-queue.constants.ts`). Cada job é executado através de
 * `MercadoLivreJobsService.withTracking`, que decide por categoria de erro se o BullMQ deve
 * tentar de novo ou parar.
 */
@Injectable()
export class MercadoLivreWorkerService implements OnModuleInit, OnModuleDestroy {
  private worker?: Worker;
  private connection?: Redis;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly logger: AppLoggerService,
    private readonly jobsService: MercadoLivreJobsService,
    private readonly ordersSync: MercadoLivreOrdersSyncService,
  ) {
    this.logger.setContext('MercadoLivreWorker');
  }

  onModuleInit() {
    this.connection = new Redis(this.configService.get<string>('redisUrl')!, { maxRetriesPerRequest: null });
    this.worker = new Worker(MERCADO_LIVRE_QUEUE, (job) => this.process(job), { connection: this.connection });

    this.worker.on('completed', (job) => this.logger.log('job_completed', { operation: job.name }));
    this.worker.on('failed', (job, err) =>
      this.logger.error('job_failed', { operation: job?.name, errorMessage: err.message }),
    );
  }

  private async integrationIdFor(companyId: string): Promise<string | null> {
    const integration = await this.prisma.client.integration.findUnique({
      where: { companyId_provider: { companyId, provider: IntegrationProvider.MERCADO_LIVRE } },
    });
    return integration?.id ?? null;
  }

  private async process(job: Job): Promise<void> {
    switch (job.name) {
      case MERCADO_LIVRE_JOBS.IMPORT_ORDERS: {
        const data = job.data as MercadoLivreImportOrdersJobData;
        return this.runTracked(job, data.companyId, () => this.ordersSync.syncOrders(data.companyId, null));
      }
      case MERCADO_LIVRE_JOBS.RECONCILE_ORDERS: {
        const data = job.data as MercadoLivreReconcileOrdersJobData;
        return this.runTracked(job, data.companyId, () => this.ordersSync.syncOrders(data.companyId, null));
      }
      default:
        this.logger.warn('unknown_job', { operation: job.name });
    }
  }

  private async runTracked<T>(job: Job, companyId: string | undefined, fn: () => Promise<T>): Promise<void> {
    if (!companyId) return;
    const integrationId = await this.integrationIdFor(companyId);
    if (!integrationId) return;

    await this.jobsService.withTracking(
      {
        integrationId,
        type: job.name,
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
