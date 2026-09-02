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
   * Reaplicado no boot tanto pela API quanto pelo worker (os dois carregam `TikTokModule`) —
   * `queue.add` com `jobId`/`repeat` manual (get + remove + add) tem uma janela de corrida real:
   * confirmado em produção, os dois processos subindo ao mesmo tempo criaram DOIS agendamentos
   * repetíveis simultâneos (visível na tela de Jobs: dois "tiktok-reconcile-orders" completos no
   * mesmo minuto). `upsertJobScheduler` é a operação atômica do BullMQ pra exatamente este caso —
   * cria ou atualiza o agendamento por um ID estável num único passo do lado do Redis, então
   * chamadas concorrentes convergem pra um único agendamento em vez de correr risco de duplicar.
   */
  async ensureReconcileSchedule(companyId: string, intervalMinutes: number) {
    const jobId = `reconcile-${companyId}`;

    // Limpeza de transição: confirmado em produção que existiam TRÊS agendamentos simultâneos
    // pra este job — dois deles SEM `id` nenhum (criados antes deste campo existir no código,
    // um a cada 5min e um a cada 15min, sobrando de deploys bem anteriores), então o filtro
    // antigo (`job.id === jobId`) nunca os alcançava — eles não tinham id pra bater com nada, e
    // ficavam rodando pra sempre em paralelo com o agendamento "certo". Remove todo agendamento
    // deste JOB (por nome) que não tenha id ou cujo id seja exatamente o desta empresa — nunca
    // mexe num agendamento de nome diferente nem no de outra empresa (id diferente e não-nulo).
    const legacyRepeatable = await this.queue.getRepeatableJobs();
    await Promise.all(
      legacyRepeatable
        .filter((job) => job.name === INTEGRATION_JOBS.RECONCILE_ORDERS && (!job.id || job.id === jobId))
        .map((job) => this.queue.removeRepeatableByKey(job.key)),
    );

    await this.upsertScheduleIfChanged(jobId, intervalMinutes, {
      name: INTEGRATION_JOBS.RECONCILE_ORDERS,
      data: { companyId } satisfies ReconcileOrdersJobData,
    });
  }

  /**
   * Mesmo mecanismo de `ensureReconcileSchedule`, mas para a sincronização financeira
   * (Statements/Transactions -> `marketplace_fees`) — até agora ela só rodava quando alguém
   * clicava manualmente em "Sincronizar financeiro" ou reprocessava um job falho na mão. Sem
   * agendamento automático, um pedido pago nunca tinha a taxa da plataforma preenchida sozinho
   * (a tela de detalhe do pedido lê `marketplace_fees`, alimentada só por este job — nunca pela
   * sincronização de pedidos, que é uma fila totalmente separada).
   */
  async ensureFinanceSyncSchedule(companyId: string, intervalMinutes: number) {
    const jobId = `finance-sync-${companyId}`;

    const legacyRepeatable = await this.queue.getRepeatableJobs();
    await Promise.all(
      legacyRepeatable
        .filter((job) => job.name === INTEGRATION_JOBS.SYNC_FINANCE && (!job.id || job.id === jobId))
        .map((job) => this.queue.removeRepeatableByKey(job.key)),
    );

    await this.upsertScheduleIfChanged(jobId, intervalMinutes, {
      name: INTEGRATION_JOBS.SYNC_FINANCE,
      data: { companyId } satisfies SyncFinanceJobData,
    });
  }

  /**
   * A partir do BullMQ 5.19, `upsertJobScheduler` dispara uma execução IMEDIATA toda vez que é
   * chamado — mesmo re-registrando um agendamento já existente, sem nenhuma mudança de verdade
   * (confirmado: https://github.com/taskforcesh/bullmq/issues/3084, "immediately" virou sempre
   * ligado). Como `onModuleInit` reaplica o agendamento em TODO boot da API e do worker — e cada
   * `docker compose run` de um script de diagnóstico também conta como um boot —, isso vinha
   * disparando uma rajada de execuções extras a cada restart/diagnóstico, sem nenhuma mudança
   * real de intervalo (confirmado em produção: `tiktok-reconcile-orders`/`tiktok-sync-finance`
   * rodando a cada 1-3 min na tela de Jobs, bem mais frequente que os 5min/60min configurados).
   * Só chama `upsertJobScheduler` de verdade quando o intervalo atual difere do já registrado (ou
   * não existe nenhum ainda) — reaplicar o MESMO valor nunca deveria ter efeito nenhum.
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
