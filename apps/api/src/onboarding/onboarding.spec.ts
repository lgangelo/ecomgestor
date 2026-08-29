import type { PrismaService } from '../common/prisma/prisma.service';
import { OnboardingService } from './onboarding.service';

interface FakeConfig {
  company: { legalName: string | null; cnpj: string | null } | null;
  productCount: number;
  stockEntryCount: number;
  taxConfigCount: number;
  tiktokIntegration: { status: string } | null;
}

function makeFakePrisma(config: FakeConfig): PrismaService {
  return {
    client: {
      company: { findUnique: async () => config.company },
      product: { count: async () => config.productCount },
      stockEntry: { count: async () => config.stockEntryCount },
      taxConfiguration: { count: async () => config.taxConfigCount },
      integration: { findUnique: async () => config.tiktokIntegration },
    },
  } as unknown as PrismaService;
}

describe('OnboardingService.getStatus (Fase 4, seção 64)', () => {
  it('nenhum passo concluído: todos os 5 aparecem como pendentes', async () => {
    const service = new OnboardingService(
      makeFakePrisma({
        company: { legalName: null, cnpj: null },
        productCount: 0,
        stockEntryCount: 0,
        taxConfigCount: 0,
        tiktokIntegration: null,
      }),
    );

    const status = await service.getStatus('company-1');

    expect(status.totalCount).toBe(5);
    expect(status.completedCount).toBe(0);
    expect(status.steps.every((s) => !s.completed)).toBe(true);
  });

  it('todos os passos concluídos: contagem bate e nenhum step falta', async () => {
    const service = new OnboardingService(
      makeFakePrisma({
        company: { legalName: 'Razão Social LTDA', cnpj: null },
        productCount: 3,
        stockEntryCount: 1,
        taxConfigCount: 1,
        tiktokIntegration: { status: 'CONNECTED' },
      }),
    );

    const status = await service.getStatus('company-1');

    expect(status.completedCount).toBe(5);
    expect(status.steps.every((s) => s.completed)).toBe(true);
  });

  it('integração TikTok desconectada não conta como conectada', async () => {
    const service = new OnboardingService(
      makeFakePrisma({
        company: { legalName: null, cnpj: null },
        productCount: 0,
        stockEntryCount: 0,
        taxConfigCount: 0,
        tiktokIntegration: { status: 'DISCONNECTED' },
      }),
    );

    const status = await service.getStatus('company-1');

    expect(status.steps.find((s) => s.key === 'tiktok')?.completed).toBe(false);
  });
});
