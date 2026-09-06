import { Injectable, NotFoundException } from '@nestjs/common';
import { IntegrationProvider, Prisma } from '@ecommerce-manager/database';
import { MercadoLivreApiError, isMercadoLivreRetryableCategory } from '@ecommerce-manager/integrations';
import { PrismaService } from '../../common/prisma/prisma.service';
import { MercadoLivreQueueService } from '../../queue/mercadolivre-queue.service';
import type { AuthenticatedUser } from '../../auth/types/authenticated-user';
import { MERCADO_LIVRE_JOBS } from '../../queue/mercadolivre-queue.constants';
import { MercadoLivreProductsSyncService } from './mercadolivre-products-sync.service';

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
    private readonly productsSync: MercadoLivreProductsSyncService,
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

    // Pedido do usuário: a falha de publicação de cor/descrição precisa aparecer com contexto de
    // verdade (nome do produto, SKU, cor tentada) — não só o id da variante — pra dar pra editar
    // e reenviar direto nesta tela, sem precisar abrir outra. `relatedExternalId` é o variantId
    // pra estes dois tipos de job (nunca um id externo de verdade, ao contrário dos outros tipos).
    const productJobTypes: string[] = [MERCADO_LIVRE_JOBS.PUBLISH_PRODUCT_COLOR, MERCADO_LIVRE_JOBS.PUBLISH_PRODUCT_DESCRIPTION];
    const productJobVariantIds = jobs
      .filter((j) => productJobTypes.includes(j.type) && j.relatedExternalId)
      .map((j) => j.relatedExternalId!);
    const variants = productJobVariantIds.length
      ? await this.prisma.client.productVariant.findMany({
          where: { id: { in: productJobVariantIds } },
          include: { product: { select: { id: true, name: true } } },
        })
      : [];
    const variantById = new Map(variants.map((v) => [v.id, v]));

    return jobs.map((job) => {
      const variant = job.relatedExternalId ? variantById.get(job.relatedExternalId) : undefined;
      return {
        id: job.id,
        type: job.type,
        relatedExternalId: job.relatedExternalId,
        attempts: job.attempts,
        maxAttempts: job.maxAttempts,
        errorCategory: job.errorCategory,
        error: job.error,
        createdAt: job.createdAt,
        finishedAt: job.finishedAt,
        variantId: variant?.id ?? null,
        productId: variant?.product.id ?? null,
        productName: variant?.product.name ?? null,
        sku: variant?.sku ?? null,
        color: variant?.color ?? null,
      };
    });
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
    await this.requeue(user, job.type, job.relatedExternalId);
  }

  private async requeue(user: AuthenticatedUser, type: string, relatedExternalId: string | null) {
    switch (type) {
      case MERCADO_LIVRE_JOBS.IMPORT_ORDERS:
      case MERCADO_LIVRE_JOBS.RECONCILE_ORDERS:
        await this.queue.enqueueImportOrders({ companyId: user.companyId });
        return;
      // Nunca passa pela fila BullMQ — publicação de produto roda direto no ciclo síncrono do
      // agendador, então "reenfileirar" aqui é chamar a publicação de novo pra esta variante,
      // usando os dados ATUAIS do banco (se o usuário corrigiu a cor, é essa cor nova que tenta).
      case MERCADO_LIVRE_JOBS.PUBLISH_PRODUCT_COLOR:
        if (!relatedExternalId) return;
        await this.productsSync.retryColorPublish(user.companyId, relatedExternalId);
        return;
      case MERCADO_LIVRE_JOBS.PUBLISH_PRODUCT_DESCRIPTION:
        if (!relatedExternalId) return;
        await this.productsSync.retryDescriptionPublish(user.companyId, relatedExternalId);
        return;
      default:
        return;
    }
  }
}
