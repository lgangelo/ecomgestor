import type { PrismaService } from '../common/prisma/prisma.service';
import type { FiscalService } from '../fiscal/fiscal.service';

jest.mock('../finance/monthly-closing-checklist.util', () => ({
  buildMonthlyClosingChecklist: jest.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { buildMonthlyClosingChecklist } = jest.requireMock('../finance/monthly-closing-checklist.util') as {
  buildMonthlyClosingChecklist: jest.Mock;
};

import { NotificationsService } from './notifications.service';

interface FakeConfig {
  inventories: Array<{ onHand: number; reserved: number; variant: { minStock: number } }>;
  salesWithoutInvoiceCount: number;
  tiktokSyncFailedCount: number;
  unmappedOrdersCount: number;
  existingClosing: { status: string } | null;
}

function makeFakePrisma(config: FakeConfig) {
  const upsertCalls: Array<{ where: { companyId_dedupeKey: { dedupeKey: string } }; update: Record<string, unknown> }> = [];
  const updateManyCalls: Array<{ where: { dedupeKey: { in: string[] } }; data: Record<string, unknown> }> = [];

  const prisma = {
    client: {
      company: { findMany: async () => [{ id: 'company-1' }] },
      inventory: { findMany: async () => config.inventories },
      syncJob: { count: async () => config.tiktokSyncFailedCount },
      order: { count: async () => config.unmappedOrdersCount },
      monthlyClosing: { findUnique: async () => config.existingClosing },
      notification: {
        upsert: async (args: (typeof upsertCalls)[number]) => {
          upsertCalls.push(args);
          return {};
        },
        updateMany: async (args: (typeof updateManyCalls)[number]) => {
          updateManyCalls.push(args);
          return { count: args.where.dedupeKey.in.length };
        },
      },
    },
  } as unknown as PrismaService;

  return { prisma, upsertCalls, updateManyCalls };
}

function makeFakeFiscalService(salesWithoutInvoiceCount: number): FiscalService {
  return {
    getPending: async () => ({
      salesWithoutInvoice: Array.from({ length: salesWithoutInvoiceCount }, (_, i) => ({ id: `sale-${i}` })),
      returnsWithoutDocument: [],
      salesWithoutInvoiceCount,
      returnsWithoutDocumentCount: 0,
    }),
  } as unknown as FiscalService;
}

const NO_STOCK_ISSUES = { inventories: [], salesWithoutInvoiceCount: 0, tiktokSyncFailedCount: 0, unmappedOrdersCount: 0 };

beforeEach(() => {
  buildMonthlyClosingChecklist.mockReset();
  buildMonthlyClosingChecklist.mockResolvedValue({ warnings: [] });
});

describe('NotificationsService.reconcileCompany (Fase 4, seções 41-43)', () => {
  it('cria notificação (upsert, nunca create solto) para cada condição ativa', async () => {
    const { prisma, upsertCalls } = makeFakePrisma({
      ...NO_STOCK_ISSUES,
      inventories: [
        { onHand: 1, reserved: 0, variant: { minStock: 5 } },
        { onHand: 1, reserved: 0, variant: { minStock: 5 } },
      ],
      existingClosing: null,
    });
    const service = new NotificationsService(prisma, makeFakeFiscalService(0));

    const activeCount = await service.reconcileCompany('company-1');

    expect(activeCount).toBe(1);
    expect(upsertCalls).toHaveLength(1);
    expect(upsertCalls[0].where.companyId_dedupeKey.dedupeKey).toBe('low_stock');
    expect(upsertCalls[0].update.resolvedAt).toBeNull();
  });

  it('resolve automaticamente quando a condição deixa de ser verdadeira', async () => {
    const { prisma, updateManyCalls } = makeFakePrisma({
      ...NO_STOCK_ISSUES,
      existingClosing: null,
    });
    const service = new NotificationsService(prisma, makeFakeFiscalService(0));

    await service.reconcileCompany('company-1');

    const resolvedKeys = updateManyCalls.flatMap((c) => c.where.dedupeKey.in);
    expect(resolvedKeys).toContain('low_stock');
    expect(resolvedKeys).toContain('fiscal_pending_sales');
    expect(resolvedKeys).toContain('tiktok_sync_failed');
    expect(resolvedKeys).toContain('tiktok_unmapped');
    expect(updateManyCalls.every((c) => c.data.resolvedAt instanceof Date)).toBe(true);
  });

  it('mesma condição ativa em duas execuções seguidas sempre usa a mesma dedupeKey (nunca duplica)', async () => {
    const { prisma, upsertCalls } = makeFakePrisma({
      ...NO_STOCK_ISSUES,
      salesWithoutInvoiceCount: 2,
      existingClosing: null,
    });
    const service = new NotificationsService(prisma, makeFakeFiscalService(2));

    await service.reconcileCompany('company-1');
    await service.reconcileCompany('company-1');

    const fiscalUpserts = upsertCalls.filter((c) => c.where.companyId_dedupeKey.dedupeKey === 'fiscal_pending_sales');
    expect(fiscalUpserts).toHaveLength(2); // duas execuções, mesma chave — nunca uma segunda chave nova
    expect(fiscalUpserts[0].where.companyId_dedupeKey.dedupeKey).toBe(fiscalUpserts[1].where.companyId_dedupeKey.dedupeKey);
  });

  it('fechamento do mês corrente: pendências geram aviso enquanto o período está aberto', async () => {
    buildMonthlyClosingChecklist.mockResolvedValue({ warnings: [{ key: 'x' }, { key: 'y' }] });
    const { prisma, upsertCalls } = makeFakePrisma({ ...NO_STOCK_ISSUES, existingClosing: null });
    const service = new NotificationsService(prisma, makeFakeFiscalService(0));

    await service.reconcileCompany('company-1');

    const closingUpsert = upsertCalls.find((c) => c.where.companyId_dedupeKey.dedupeKey.startsWith('monthly_closing_pending:'));
    expect(closingUpsert).toBeDefined();
    expect(buildMonthlyClosingChecklist).toHaveBeenCalled();
  });

  it('mês já fechado: nunca calcula o checklist de novo e resolve uma notificação anterior', async () => {
    const { prisma, updateManyCalls } = makeFakePrisma({ ...NO_STOCK_ISSUES, existingClosing: { status: 'CLOSED' } });
    const service = new NotificationsService(prisma, makeFakeFiscalService(0));

    await service.reconcileCompany('company-1');

    expect(buildMonthlyClosingChecklist).not.toHaveBeenCalled();
    const resolvedKeys = updateManyCalls.flatMap((c) => c.where.dedupeKey.in);
    expect(resolvedKeys.some((k) => k.startsWith('monthly_closing_pending:'))).toBe(true);
  });
});
