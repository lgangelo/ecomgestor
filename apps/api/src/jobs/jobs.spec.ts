import { BadRequestException } from '@nestjs/common';
import type { PrismaService } from '../common/prisma/prisma.service';
import type { TikTokJobsService } from '../integrations/tiktok/tiktok-jobs.service';
import type { MercadoLivreJobsService } from '../integrations/mercadolivre/mercadolivre-jobs.service';
import type { AuthenticatedUser } from '../auth/types/authenticated-user';
import { JobsService } from './jobs.service';

interface FakeSyncJob {
  id: string;
  companyId: string;
  type: string;
  status: string;
  relatedExternalId: string | null;
  attempts: number;
  maxAttempts: number;
  errorCategory: string | null;
  error: string | null;
  createdAt: Date;
  startedAt: Date | null;
  finishedAt: Date | null;
  payload: unknown;
  provider: string;
}

interface FakeWhere {
  id?: string;
  integration?: { companyId: string };
  status?: string;
  type?: string;
  createdAt?: { gte?: Date; lte?: Date };
}

function matches(job: FakeSyncJob, where: FakeWhere): boolean {
  if (where.id && job.id !== where.id) return false;
  if (where.integration?.companyId && job.companyId !== where.integration.companyId) return false;
  if (where.status && job.status !== where.status) return false;
  if (where.type && job.type !== where.type) return false;
  if (where.createdAt?.gte && job.createdAt < where.createdAt.gte) return false;
  if (where.createdAt?.lte && job.createdAt > where.createdAt.lte) return false;
  return true;
}

function makeFakePrisma(jobs: FakeSyncJob[]): PrismaService {
  return {
    client: {
      syncJob: {
        findMany: async ({ where, skip, take }: { where: FakeWhere; skip?: number; take?: number }) => {
          let result = jobs
            .filter((j) => matches(j, where))
            .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
          if (skip !== undefined) result = result.slice(skip);
          if (take !== undefined) result = result.slice(0, take);
          return result;
        },
        count: async ({ where }: { where: FakeWhere }) => jobs.filter((j) => matches(j, where)).length,
        findFirst: async ({ where }: { where: FakeWhere }) => {
          const job = jobs.find((j) => matches(j, where)) ?? null;
          return job ? { ...job, integration: { provider: job.provider } } : null;
        },
      },
    },
  } as unknown as PrismaService;
}

function makeJob(overrides: Partial<FakeSyncJob>): FakeSyncJob {
  return {
    id: 'job-1',
    companyId: 'company-1',
    type: 'tiktok-import-orders',
    status: 'COMPLETED',
    relatedExternalId: null,
    attempts: 1,
    maxAttempts: 5,
    errorCategory: null,
    error: null,
    createdAt: new Date('2026-08-01T00:00:00Z'),
    startedAt: new Date('2026-08-01T00:00:00Z'),
    finishedAt: new Date('2026-08-01T00:00:05Z'),
    payload: { secretToken: 'super-secret' },
    provider: 'TIKTOK_SHOP',
    ...overrides,
  };
}

function makeService(
  prisma: PrismaService,
  tiktok: Partial<TikTokJobsService> = {},
  mercadoLivre: Partial<MercadoLivreJobsService> = {},
) {
  return new JobsService(prisma, tiktok as unknown as TikTokJobsService, mercadoLivre as unknown as MercadoLivreJobsService);
}

const NO_QUERY = { page: 1, pageSize: 20 };

describe('JobsService (Fase 4, seções 45-48)', () => {
  it('isolamento por empresa: nunca lista jobs de outra empresa', async () => {
    const prisma = makeFakePrisma([
      makeJob({ id: 'job-a', companyId: 'company-a' }),
      makeJob({ id: 'job-b', companyId: 'company-b' }),
    ]);
    const service = makeService(prisma);

    const result = await service.list('company-a', NO_QUERY);

    expect(result.items).toHaveLength(1);
    expect(result.items[0].id).toBe('job-a');
  });

  it('filtra por status', async () => {
    const prisma = makeFakePrisma([
      makeJob({ id: 'job-failed', status: 'FAILED' }),
      makeJob({ id: 'job-ok', status: 'COMPLETED' }),
    ]);
    const service = makeService(prisma);

    const result = await service.list('company-1', { ...NO_QUERY, status: 'FAILED' });

    expect(result.items).toHaveLength(1);
    expect(result.items[0].id).toBe('job-failed');
  });

  it('nunca expõe o payload bruto do job (seção 47 — pode conter token/segredo)', async () => {
    const prisma = makeFakePrisma([makeJob({ id: 'job-1' })]);
    const service = makeService(prisma);

    const job = await service.findOne('company-1', 'job-1');

    expect(job).not.toHaveProperty('payload');
    expect(JSON.stringify(job)).not.toContain('super-secret');
  });

  it('retry: recusa quando o job não está FAILED', async () => {
    const prisma = makeFakePrisma([makeJob({ id: 'job-1', status: 'COMPLETED' })]);
    const service = makeService(prisma);

    await expect(service.retry('company-1', {} as AuthenticatedUser, 'job-1')).rejects.toThrow(BadRequestException);
  });

  it('retry: aciona o reprocessamento quando o job está FAILED', async () => {
    const prisma = makeFakePrisma([makeJob({ id: 'job-1', status: 'FAILED' })]);
    const retryAndRequeue = jest.fn().mockResolvedValue(undefined);
    const service = makeService(prisma, { retryAndRequeue });

    await service.retry('company-1', { companyId: 'company-1' } as AuthenticatedUser, 'job-1');

    expect(retryAndRequeue).toHaveBeenCalledWith('job-1', { companyId: 'company-1' });
  });

  it(
    'ACHADO REAL corrigido: retry despacha pro serviço certo conforme o provider — antes chamava ' +
      'sempre o do TikTok, mesmo pra um job de outra integração (Mercado Livre)',
    async () => {
      const prisma = makeFakePrisma([makeJob({ id: 'job-ml', status: 'FAILED', provider: 'MERCADO_LIVRE' })]);
      const tiktokRetry = jest.fn().mockResolvedValue(undefined);
      const mercadoLivreRetry = jest.fn().mockResolvedValue(undefined);
      const service = makeService(prisma, { retryAndRequeue: tiktokRetry }, { retryAndRequeue: mercadoLivreRetry });

      await service.retry('company-1', { companyId: 'company-1' } as AuthenticatedUser, 'job-ml');

      expect(mercadoLivreRetry).toHaveBeenCalledWith('job-ml', { companyId: 'company-1' });
      expect(tiktokRetry).not.toHaveBeenCalled();
    },
  );
});
