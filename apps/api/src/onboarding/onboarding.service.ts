import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';

export interface OnboardingStep {
  key: string;
  label: string;
  completed: boolean;
  href: string;
}

export interface OnboardingStatus {
  steps: OnboardingStep[];
  completedCount: number;
  totalCount: number;
}

/**
 * Checklist de primeira utilização (seção 64 da Fase 4) — nunca bloqueia o uso do sistema, só
 * mostra progresso. "Ocultar" é uma preferência só do navegador (localStorage), não precisa de
 * campo novo no schema para isso.
 */
@Injectable()
export class OnboardingService {
  constructor(private readonly prisma: PrismaService) {}

  async getStatus(companyId: string): Promise<OnboardingStatus> {
    const [company, productCount, stockEntryCount, taxConfigCount, tiktokIntegration] = await Promise.all([
      this.prisma.client.company.findUnique({ where: { id: companyId }, select: { legalName: true, cnpj: true } }),
      this.prisma.client.product.count({ where: { companyId } }),
      this.prisma.client.stockEntry.count({ where: { companyId } }),
      this.prisma.client.taxConfiguration.count({ where: { companyId } }),
      this.prisma.client.integration.findUnique({
        where: { companyId_provider: { companyId, provider: 'TIKTOK_SHOP' } },
        select: { status: true },
      }),
    ]);

    const steps: OnboardingStep[] = [
      {
        key: 'company',
        label: 'Configure sua empresa',
        completed: Boolean(company?.legalName || company?.cnpj),
        href: '/configuracoes/empresa',
      },
      {
        key: 'product',
        label: 'Cadastre seu primeiro produto',
        completed: productCount > 0,
        href: '/produtos',
      },
      {
        key: 'stock_entry',
        label: 'Registre uma entrada de estoque',
        completed: stockEntryCount > 0,
        href: '/produtos/entradas',
      },
      {
        key: 'tax_configuration',
        label: 'Configure impostos estimados',
        completed: taxConfigCount > 0,
        href: '/financeiro',
      },
      {
        key: 'tiktok',
        label: 'Conecte a TikTok Shop',
        completed: Boolean(tiktokIntegration && tiktokIntegration.status !== 'DISCONNECTED'),
        href: '/integracoes/tiktok',
      },
    ];

    return { steps, completedCount: steps.filter((s) => s.completed).length, totalCount: steps.length };
  }
}
