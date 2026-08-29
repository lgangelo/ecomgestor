import { TikTokApiError } from '@ecommerce-manager/integrations';
import type { PrismaService } from '../../common/prisma/prisma.service';
import { TikTokJobsService } from './tiktok-jobs.service';

interface FakeJob {
  id: string;
  integrationId: string;
  type: string;
  relatedExternalId: string | null;
  status: string;
  attempts: number;
  maxAttempts: number;
  errorCategory: string | null;
  error: string | null;
}

function makeFakePrisma() {
  const jobs: FakeJob[] = [];
  let counter = 0;

  const client = {
    syncJob: {
      findFirst: async ({ where }: { where: { integrationId: string; type: string; relatedExternalId: string | null; status: { in: string[] } } }) =>
        jobs.find(
          (j) =>
            j.integrationId === where.integrationId &&
            j.type === where.type &&
            j.relatedExternalId === where.relatedExternalId &&
            where.status.in.includes(j.status),
        ) ?? null,
      create: async ({ data }: { data: Partial<FakeJob> }) => {
        const job = {
          id: `job-${++counter}`,
          error: null,
          errorCategory: null,
          ...data,
        } as FakeJob;
        jobs.push(job);
        return job;
      },
      update: async ({ where, data }: { where: { id: string }; data: Partial<FakeJob> }) => {
        const job = jobs.find((j) => j.id === where.id)!;
        Object.assign(job, data);
        return job;
      },
    },
  };

  return { client: client as unknown as PrismaService['client'], jobs };
}

describe('TikTokJobsService.withTracking — política de retry (seção 25/27)', () => {
  it('erro de rate limit dentro do limite de tentativas: relança para o BullMQ reagendar', async () => {
    const { client, jobs } = makeFakePrisma();
    const service = new TikTokJobsService({ client } as unknown as PrismaService, {} as never);

    await expect(
      service.withTracking(
        { integrationId: 'int-1', type: 'tiktok-import-orders', attemptNumber: 1, maxAttempts: 5 },
        async () => {
          throw new TikTokApiError('rate limited', 'RATE_LIMIT', 429);
        },
      ),
    ).rejects.toThrow('rate limited');

    expect(jobs[0].status).toBe('PENDING');
    expect(jobs[0].errorCategory).toBe('RATE_LIMIT');
  });

  it('erro de autenticação nunca é relançado — para imediatamente e marca FAILED', async () => {
    const { client, jobs } = makeFakePrisma();
    const service = new TikTokJobsService({ client } as unknown as PrismaService, {} as never);

    const result = await service.withTracking(
      { integrationId: 'int-1', type: 'tiktok-import-orders', attemptNumber: 1, maxAttempts: 5 },
      async () => {
        throw new TikTokApiError('token expirado', 'AUTH', 401);
      },
    );

    expect(result).toBeNull();
    expect(jobs[0].status).toBe('FAILED');
    expect(jobs[0].errorCategory).toBe('AUTH');
  });

  it('esgotadas as tentativas, mesmo um erro retryable para de ser relançado (nunca retry infinito)', async () => {
    const { client, jobs } = makeFakePrisma();
    const service = new TikTokJobsService({ client } as unknown as PrismaService, {} as never);

    const result = await service.withTracking(
      { integrationId: 'int-1', type: 'tiktok-import-orders', attemptNumber: 5, maxAttempts: 5 },
      async () => {
        throw new TikTokApiError('instabilidade temporária', 'TEMPORARY', 503);
      },
    );

    expect(result).toBeNull();
    expect(jobs[0].status).toBe('FAILED');
  });

  it('sucesso marca o job como COMPLETED e retorna o valor da função', async () => {
    const { client, jobs } = makeFakePrisma();
    const service = new TikTokJobsService({ client } as unknown as PrismaService, {} as never);

    const result = await service.withTracking(
      { integrationId: 'int-1', type: 'tiktok-import-orders', attemptNumber: 1, maxAttempts: 5 },
      async () => ({ imported: 3 }),
    );

    expect(result).toEqual({ imported: 3 });
    expect(jobs[0].status).toBe('COMPLETED');
  });
});
