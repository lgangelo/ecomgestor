import { Injectable, NotFoundException } from '@nestjs/common';
import { IntegrationProvider, Prisma } from '@ecommerce-manager/database';
import { MercadoLivreApiError, isMercadoLivreRetryableCategory } from '@ecommerce-manager/integrations';
import { PrismaService } from '../../common/prisma/prisma.service';
import { MercadoLivreQueueService } from '../../queue/mercadolivre-queue.service';
import type { AuthenticatedUser } from '../../auth/types/authenticated-user';
import { MERCADO_LIVRE_JOBS } from '../../queue/mercadolivre-queue.constants';

interface AttemptParams {
  integrationId: string;
  type: string;
  relatedExternalId?: string;
  payload?: unknown;
  attemptNumber: number;
  maxAttempts: number;
}

/**
 * Rastreamento de jobs do Mercado Livre para a tela "Falhas"/Jobs — mesmo papel de
 * `TikTokJobsService`. O retry em si é do BullMQ (attempts/backoff configurados na fila); este
 * serviço só decide, por categoria de erro, se vale deixar o BullMQ tentar de novo ou se deve
 * parar imediatamente (nunca retry infinito, nunca retry para erro de AUTH/VALIDATION/PERMANENT).
 */
@Injectable()
export class MercadoLivreJobsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: MercadoLivreQueueService,
  ) {}

  async withTracking<T>(params: AttemptParams, fn: () => Promise<T>): Promise<T | null> {
    const record = await this.recordAttempt(params);
    try {
      const result = await fn();
      await this.prisma.client.syncJob.update({
        where: { id: record.id },
        data: {
          status: 'COMPLETED',
          finishedAt: new Date(),
          error: null,
          ...(result !== undefined ? { result: result as unknown as Prisma.InputJsonValue } : {}),
        },
      });
      return result;
    } catch (error) {
      const category = error instanceof MercadoLivreApiError ? error.category : 'PERMANENT';
      const retryable = isMercadoLivreRetryableCategory(category) && params.attemptNumber < params.maxAttempts;
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
      where: { companyId_provider: { companyId, provider: IntegrationProvider.MERCADO_LIVRE } },
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

  async prepareRetry(jobId: string, companyId: string) {
    const job = await this.prisma.client.syncJob.findFirst({
      where: { id: jobId, integration: { companyId, provider: IntegrationProvider.MERCADO_LIVRE } },
    });
    if (!job) throw new NotFoundException('Job não encontrado');

    await this.prisma.client.syncJob.update({
      where: { id: jobId },
      data: { status: 'PENDING', attempts: 0, error: null, errorCategory: null, finishedAt: null },
    });

    return job;
  }

  /** Reprocessa um job manualmente — mesmo papel de `TikTokJobsService.retryAndRequeue`. */
  async retryAndRequeue(jobId: string, user: AuthenticatedUser): Promise<void> {
    const job = await this.prepareRetry(jobId, user.companyId);
    await this.requeue(user, job.type);
  }

  private async requeue(user: AuthenticatedUser, type: string) {
    switch (type) {
      case MERCADO_LIVRE_JOBS.IMPORT_ORDERS:
      case MERCADO_LIVRE_JOBS.RECONCILE_ORDERS:
        await this.queue.enqueueImportOrders({ companyId: user.companyId });
        return;
      default:
        return;
    }
  }
}
