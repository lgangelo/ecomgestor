import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { IntegrationProvider, type Prisma } from '@ecommerce-manager/database';
import { PrismaService } from '../common/prisma/prisma.service';
import { paginate } from '../common/dto/pagination.dto';
import { endOfDayExclusive } from '../common/date/day-range.util';
import { INTEGRATION_QUEUE } from '../queue/tiktok-queue.constants';
import { TikTokJobsService } from '../integrations/tiktok/tiktok-jobs.service';
import { MercadoLivreJobsService } from '../integrations/mercadolivre/mercadolivre-jobs.service';
import type { AuthenticatedUser } from '../auth/types/authenticated-user';
import { ListJobsQueryDto } from './dto/list-jobs-query.dto';

interface RawSyncJob {
  id: string;
  type: string;
  status: string;
  relatedExternalId: string | null;
  attempts: number;
  maxAttempts: number;
  errorCategory: string | null;
  error: string | null;
  result: unknown;
  createdAt: Date;
  startedAt: Date | null;
  finishedAt: Date | null;
}

function durationMs(job: RawSyncJob): number | null {
  if (!job.startedAt || !job.finishedAt) return null;
  return job.finishedAt.getTime() - job.startedAt.getTime();
}

/** Nunca inclui `payload` (seção 47 da Fase 4 — pode conter dado sensível) nem qualquer campo
 * fora desta lista explícita. */
function toJobItem(job: RawSyncJob) {
  return {
    id: job.id,
    queue: INTEGRATION_QUEUE,
    type: job.type,
    status: job.status,
    relatedExternalId: job.relatedExternalId,
    attempts: job.attempts,
    maxAttempts: job.maxAttempts,
    errorCategory: job.errorCategory,
    error: job.error,
    result: job.result,
    createdAt: job.createdAt,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt,
    durationMs: durationMs(job),
  };
}

/**
 * Painel de jobs (seções 45-48 da Fase 4) — reaproveita o modelo `SyncJob` já existente da Fase
 * 3 sem mudança de schema (seção 49). "Fila" ainda é um rótulo fixo (INTEGRATION_QUEUE) mesmo
 * pros jobs do Mercado Livre, que nem passam por fila de verdade — só rótulo de exibição, nunca
 * usado pra decidir o retry (ver `retry` abaixo).
 */
@Injectable()
export class JobsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tiktokJobsService: TikTokJobsService,
    private readonly mercadoLivreJobsService: MercadoLivreJobsService,
  ) {}

  async list(companyId: string, query: ListJobsQueryDto) {
    const where: Prisma.SyncJobWhereInput = {
      integration: { companyId },
      ...(query.status ? { status: query.status } : {}),
      ...(query.type ? { type: query.type } : {}),
      ...(query.dateFrom || query.dateTo
        ? {
            createdAt: {
              ...(query.dateFrom ? { gte: new Date(query.dateFrom) } : {}),
              ...(query.dateTo ? { lt: endOfDayExclusive(query.dateTo) } : {}),
            },
          }
        : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.client.syncJob.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.client.syncJob.count({ where }),
    ]);

    return paginate(rows.map(toJobItem), total, query.page, query.pageSize);
  }

  async findOne(companyId: string, id: string) {
    const job = await this.prisma.client.syncJob.findFirst({ where: { id, integration: { companyId } } });
    if (!job) throw new NotFoundException('Job não encontrado');
    return toJobItem(job);
  }

  /** Reprocessamento manual (seção 48) — só para jobs `FAILED`; permissão e auditoria ficam a
   * cargo do controller (mesmo padrão do resto da API).
   *
   * ACHADO REAL corrigido: sempre chamava `tiktokJobsService.retryAndRequeue`, mesmo pra jobs de
   * outra integração (ex.: Mercado Livre) — despachava certo só por coincidência, enquanto todo
   * `SyncJob` existente era mesmo do TikTok. Agora confere o `provider` da integração dona do job
   * e despacha pro serviço certo. */
  async retry(companyId: string, user: AuthenticatedUser, id: string) {
    const job = await this.prisma.client.syncJob.findFirst({
      where: { id, integration: { companyId } },
      include: { integration: { select: { provider: true } } },
    });
    if (!job) throw new NotFoundException('Job não encontrado');
    if (job.status !== 'FAILED') {
      throw new BadRequestException('Só é possível tentar novamente jobs com status FAILED.');
    }
    if (job.integration.provider === IntegrationProvider.MERCADO_LIVRE) {
      await this.mercadoLivreJobsService.retryAndRequeue(id, user);
    } else {
      await this.tiktokJobsService.retryAndRequeue(id, user);
    }
    return this.findOne(companyId, id);
  }

  /** Limpeza de histórico (muitos jobs FAILED são de teste e não precisam ficar visíveis) —
   * remove só os jobs com status FAILED da empresa, nunca os em andamento ou concluídos. */
  async clearFailed(companyId: string) {
    const { count } = await this.prisma.client.syncJob.deleteMany({
      where: { integration: { companyId }, status: 'FAILED' },
    });
    return { deleted: count };
  }
}
