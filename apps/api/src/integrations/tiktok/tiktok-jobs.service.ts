import { Injectable, NotFoundException } from '@nestjs/common';
import { IntegrationProvider, Prisma } from '@ecommerce-manager/database';
import { TikTokApiError, isRetryableCategory } from '@ecommerce-manager/integrations';
import { PrismaService } from '../../common/prisma/prisma.service';
import { TikTokQueueService } from '../../queue/tiktok-queue.service';
import type { AuthenticatedUser } from '../../auth/types/authenticated-user';

interface AttemptParams {
  integrationId: string;
  type: string;
  relatedExternalId?: string;
  payload?: unknown;
  attemptNumber: number;
  maxAttempts: number;
}

/**
 * Rastreamento de jobs de integração para a tela "Falhas" (seção 27 da Fase 3). O retry em si
 * é do BullMQ (attempts/backoff configurados na fila) — este serviço só decide, por categoria
 * de erro, se vale deixar o BullMQ tentar de novo ou se deve parar imediatamente (seção 25:
 * nunca retry infinito, nunca retry para erro de AUTH/VALIDATION/PERMANENT).
 */
@Injectable()
export class TikTokJobsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: TikTokQueueService,
  ) {}

  /**
   * Executa `fn` rastreando tentativa/sucesso/falha. Relança o erro apenas quando a categoria
   * é retryable E ainda há tentativas disponíveis — nesse caso o BullMQ reagenda com backoff
   * exponencial. Para erro definitivo, engole o erro (o job BullMQ conclui sem re-tentar) e
   * deixa o registro visível como FAILED para retry manual (seção 27).
   */
  async withTracking<T>(params: AttemptParams, fn: () => Promise<T>): Promise<T | null> {
    const record = await this.recordAttempt(params);
    try {
      const result = await fn();
      await this.prisma.client.syncJob.update({
        where: { id: record.id },
        data: { status: 'COMPLETED', finishedAt: new Date(), error: null },
      });
      return result;
    } catch (error) {
      const category = error instanceof TikTokApiError ? error.category : 'PERMANENT';
      const retryable = isRetryableCategory(category) && params.attemptNumber < params.maxAttempts;
      await this.prisma.client.syncJob.update({
        where: { id: record.id },
        data: {
          status: retryable ? 'PENDING' : 'FAILED',
          error: (error as Error).message,
          errorCategory: category,
          finishedAt: retryable ? null : new Date(),
        },
      });
      if (retryable) throw error;
      return null;
    }
  }

  private async recordAttempt(params: AttemptParams) {
    const existing = await this.prisma.client.syncJob.findFirst({
      where: {
        integrationId: params.integrationId,
        type: params.type,
        relatedExternalId: params.relatedExternalId ?? null,
        status: { in: ['PENDING', 'RUNNING'] },
      },
      orderBy: { createdAt: 'desc' },
    });

    const data = {
      status: 'RUNNING',
      attempts: params.attemptNumber,
      maxAttempts: params.maxAttempts,
      startedAt: new Date(),
      payload: (params.payload as Prisma.InputJsonValue) ?? undefined,
    };

    if (existing) {
      return this.prisma.client.syncJob.update({ where: { id: existing.id }, data });
    }
    return this.prisma.client.syncJob.create({
      data: {
        integrationId: params.integrationId,
        type: params.type,
        relatedExternalId: params.relatedExternalId ?? null,
        ...data,
      },
    });
  }

  async listFailures(companyId: string) {
    const integration = await this.prisma.client.integration.findUnique({
      where: { companyId_provider: { companyId, provider: IntegrationProvider.TIKTOK_SHOP } },
    });
    if (!integration) return [];

    const jobs = await this.prisma.client.syncJob.findMany({
      where: { integrationId: integration.id, status: 'FAILED' },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    return jobs.map((job) => ({
      id: job.id,
      type: job.type,
      relatedExternalId: job.relatedExternalId,
      attempts: job.attempts,
      maxAttempts: job.maxAttempts,
      errorCategory: job.errorCategory,
      error: job.error,
      createdAt: job.createdAt,
      finishedAt: job.finishedAt,
    }));
  }

  /** Marca o job para nova tentativa (seção 27 — "Tentar novamente"); quem reenfileira no
   * BullMQ é o controller/service chamador, que conhece o tipo de job e seu payload. */
  async prepareRetry(jobId: string, companyId: string) {
    const job = await this.prisma.client.syncJob.findFirst({
      where: { id: jobId, integration: { companyId, provider: IntegrationProvider.TIKTOK_SHOP } },
    });
    if (!job) throw new NotFoundException('Job não encontrado');

    await this.prisma.client.syncJob.update({
      where: { id: jobId },
      data: { status: 'PENDING', attempts: 0, error: null, errorCategory: null, finishedAt: null },
    });

    return job;
  }

  /**
   * Reprocessa um job manualmente (seção 27 da Fase 3 / seção 48 da Fase 4) — usado tanto pela
   * aba de falhas da integração TikTok quanto pelo painel geral de Jobs (seção 48), já que hoje
   * todo `SyncJob` é um job TikTok. Centralizado aqui para nunca duplicar o dispatch por tipo.
   */
  async retryAndRequeue(jobId: string, user: AuthenticatedUser): Promise<void> {
    const job = await this.prepareRetry(jobId, user.companyId);
    await this.requeue(user, job.type, job.payload);
  }

  private async requeue(user: AuthenticatedUser, type: string, payload: unknown) {
    switch (type) {
      case 'tiktok-import-orders':
        await this.queue.enqueueImportOrders({ companyId: user.companyId, userId: user.userId });
        return;
      case 'tiktok-import-products':
        await this.queue.enqueueImportProducts({ companyId: user.companyId });
        return;
      case 'tiktok-sync-finance':
        await this.queue.enqueueSyncFinance({ companyId: user.companyId });
        return;
      case 'tiktok-sync-returns':
        await this.queue.enqueueSyncReturns({ companyId: user.companyId });
        return;
      case 'tiktok-push-inventory': {
        const data = payload as { variantId?: string } | null;
        if (data?.variantId) {
          await this.queue.enqueuePushInventory({ companyId: user.companyId, userId: user.userId, variantId: data.variantId });
        }
        return;
      }
      case 'tiktok-process-webhook': {
        const data = payload as { webhookEventId?: string } | null;
        if (data?.webhookEventId) {
          await this.queue.enqueueProcessWebhook({ webhookEventId: data.webhookEventId });
        }
        return;
      }
      default:
        return;
    }
  }
}
