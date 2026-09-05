import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import Redis from 'ioredis';
import { MERCADO_LIVRE_JOBS, MERCADO_LIVRE_QUEUE } from './mercadolivre-queue.constants';

export interface MercadoLivreImportOrdersJobData {
  companyId: string;
}

export interface MercadoLivreReconcileOrdersJobData {
  companyId: string;
}

const BACKOFF = { type: 'exponential', delay: 5000 } as const;

/** Produtor da fila `mercadolivre` — a API enfileira, o worker consome (mesmo padrão de
 * `tiktok-queue.service.ts`, ver comentário em `mercadolivre-queue.constants.ts` sobre por que é
 * uma fila própria em vez de reusar `integration`). */
@Injectable()
export class MercadoLivreQueueService implements OnModuleInit, OnModuleDestroy {
  private connection!: Redis;
  private queue!: Queue;

  constructor(private readonly configService: ConfigService) {}

  onModuleInit() {
    this.connection = new Redis(this.configService.get<string>('redisUrl')!, { maxRetriesPerRequest: null });
    this.queue = new Queue(MERCADO_LIVRE_QUEUE, { connection: this.connection });
  }

  async enqueueImportOrders(data: MercadoLivreImportOrdersJobData) {
    await this.queue.add(MERCADO_LIVRE_JOBS.IMPORT_ORDERS, data, { attempts: 5, backoff: BACKOFF });
  }

  /**
   * Job repetível de reconciliação — mesmo mecanismo de `TikTokQueueService.ensureReconcileSchedule`
   * (`upsertJobScheduler`, atômico do lado do Redis, evita a corrida real já confirmada em
   * produção quando API e Worker sobem ao mesmo tempo e cada um tenta criar o agendamento).
   */
  async ensureReconcileSchedule(companyId: string, intervalMinutes: number) {
    const jobId = `reconcile-${companyId}`;

    await this.upsertScheduleIfChanged(jobId, intervalMinutes, {
      name: MERCADO_LIVRE_JOBS.RECONCILE_ORDERS,
      data: { companyId } satisfies MercadoLivreReconcileOrdersJobData,
    });
  }

  /**
   * A partir do BullMQ 5.19, `upsertJobScheduler` dispara uma execução IMEDIATA toda vez que é
   * chamado, mesmo re-registrando um agendamento já existente sem nenhuma mudança de verdade
   * (mesmo bug documentado em `tiktok-queue.service.ts` — https://github.com/taskforcesh/bullmq/
   * issues/3084). Como `onModuleInit` reaplica isso em todo boot da API e do worker, só chama
   * `upsertJobScheduler` de verdade quando o intervalo atual difere do já registrado.
   */
  private async upsertScheduleIfChanged(
    jobId: string,
    intervalMinutes: number,
    template: { name: string; data: unknown },
  ) {
    const everyMs = intervalMinutes * 60_000;
    const existing = (await this.queue.getJobSchedulers()).find((s) => s.id === jobId);
    if (existing?.every === everyMs) return;

    await this.queue.upsertJobScheduler(jobId, { every: everyMs }, template);
  }

  async onModuleDestroy() {
    await this.queue?.close();
    this.connection?.disconnect();
  }
}
