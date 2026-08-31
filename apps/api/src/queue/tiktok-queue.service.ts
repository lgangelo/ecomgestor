import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import Redis from 'ioredis';
import { INTEGRATION_JOBS, INTEGRATION_QUEUE } from './tiktok-queue.constants';

export interface ImportOrdersJobData {
  companyId: string;
  userId: string | null;
  ordersSince?: string;
}

export interface ImportProductsJobData {
  companyId: string;
}

export interface ProcessWebhookJobData {
  webhookEventId: string;
}

export interface ReconcileOrdersJobData {
  companyId: string;
}

export interface SyncFinanceJobData {
  companyId: string;
}

export interface SyncReturnsJobData {
  companyId: string;
}

export interface PushInventoryJobData {
  companyId: string;
  userId: string;
  variantId: string;
}

const BACKOFF = { type: 'exponential', delay: 5000 } as const;

/** Produtor da fila `integration` — a API enfileira, o worker consome (mesmo padrão de `queue/queue.service.ts`). */
@Injectable()
export class TikTokQueueService implements OnModuleInit, OnModuleDestroy {
  private connection!: Redis;
  private queue!: Queue;

  constructor(private readonly configService: ConfigService) {}

  onModuleInit() {
    this.connection = new Redis(this.configService.get<string>('redisUrl')!, { maxRetriesPerRequest: null });
    this.queue = new Queue(INTEGRATION_QUEUE, { connection: this.connection });
  }

  async enqueueImportProducts(data: ImportProductsJobData) {
    await this.queue.add(INTEGRATION_JOBS.IMPORT_PRODUCTS, data, { attempts: 5, backoff: BACKOFF });
  }

  async enqueueImportOrders(data: ImportOrdersJobData) {
    await this.queue.add(INTEGRATION_JOBS.IMPORT_ORDERS, data, { attempts: 5, backoff: BACKOFF });
  }

  async enqueueProcessWebhook(data: ProcessWebhookJobData) {
    await this.queue.add(INTEGRATION_JOBS.PROCESS_WEBHOOK, data, { attempts: 5, backoff: BACKOFF });
  }

  async enqueueSyncFinance(data: SyncFinanceJobData) {
    await this.queue.add(INTEGRATION_JOBS.SYNC_FINANCE, data, { attempts: 5, backoff: BACKOFF });
  }

  async enqueueSyncReturns(data: SyncReturnsJobData) {
    await this.queue.add(INTEGRATION_JOBS.SYNC_RETURNS, data, { attempts: 5, backoff: BACKOFF });
  }

  async enqueuePushInventory(data: PushInventoryJobData) {
    await this.queue.add(INTEGRATION_JOBS.PUSH_INVENTORY, data, { attempts: 3, backoff: BACKOFF });
  }

  /**
   * Job repetível de reconciliação (seção 23) — intervalo configurável via
   * TIKTOK_RECONCILE_INTERVAL_MINUTES, nunca hardcoded de forma impossível de alterar.
   *
   * Confirmado em produção: `jobId` fixo NÃO substitui o agendamento anterior quando o
   * intervalo (`repeat.every`) muda — o BullMQ identifica um job repetível pela combinação de
   * nome + opções de repetição, então um `every` diferente vira um agendamento repetível
   * SEPARADO, e o antigo continua rodando pra sempre em paralelo (mudar
   * TIKTOK_RECONCILE_INTERVAL_MINUTES e reiniciar não tinha efeito nenhum). Por isso remove
   * explicitamente qualquer agendamento repetível já existente para esta empresa antes de criar
   * o novo, e só isso garante troca em vez de acúmulo.
   */
  async ensureReconcileSchedule(companyId: string, intervalMinutes: number) {
    const jobId = `reconcile-${companyId}`;
    const existing = await this.queue.getRepeatableJobs();
    await Promise.all(
      existing.filter((job) => job.id === jobId).map((job) => this.queue.removeRepeatableByKey(job.key)),
    );

    await this.queue.add(
      INTEGRATION_JOBS.RECONCILE_ORDERS,
      { companyId } satisfies ReconcileOrdersJobData,
      {
        jobId,
        repeat: { every: intervalMinutes * 60_000 },
      },
    );
  }

  async onModuleDestroy() {
    await this.queue?.close();
    this.connection?.disconnect();
  }
}
