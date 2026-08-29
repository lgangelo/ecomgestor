import type { PrismaService } from '../common/prisma/prisma.service';
import type { FiscalService } from '../fiscal/fiscal.service';
import { buildMonthlyClosingChecklist } from './monthly-closing-checklist.util';

interface OrderCounts {
  plain: number;
  attention: number;
  withoutFee: number;
  settlementPending: number;
}

interface ReturnCounts {
  plain: number;
  pending: number;
}

interface FakeCounts {
  orders: OrderCounts;
  returns: ReturnCounts;
  openInventoryCounts: number;
  pendingRecurring: number;
}

interface FakeFiscalSummary {
  saleInvoiceCount: number;
  returnInvoiceCount: number;
  xmlAvailableCount: number;
  xmlUnavailableCount: number;
}

function makeFakePrisma(counts: FakeCounts): PrismaService {
  const orderCount = async ({ where }: { where: Record<string, unknown> }) => {
    if ('integrationSyncStatus' in where) return counts.orders.attention;
    if ('marketplaceFees' in where) return counts.orders.withoutFee;
    if ('settlementTx' in where) return counts.orders.settlementPending;
    return counts.orders.plain;
  };
  const returnCount = async ({ where }: { where: Record<string, unknown> }) => {
    if ('status' in where) return counts.returns.pending;
    return counts.returns.plain;
  };
  const inventoryCountCount = async () => counts.openInventoryCounts;
  const recurringExpenseTemplateCount = async () => counts.pendingRecurring;

  return {
    client: {
      order: { count: orderCount },
      return: { count: returnCount },
      inventoryCount: { count: inventoryCountCount },
      recurringExpenseTemplate: { count: recurringExpenseTemplateCount },
    },
  } as unknown as PrismaService;
}

function makeFakeFiscalService(summary: FakeFiscalSummary): FiscalService {
  return { getMonthlySummary: async () => ({ referenceMonth: '2026-08', documentsCount: 0, ...summary }) } as unknown as FiscalService;
}

const RANGE = { start: new Date('2026-08-01T00:00:00Z'), end: new Date('2026-09-01T00:00:00Z') };

describe('buildMonthlyClosingChecklist (Fase 4, seções 20-24)', () => {
  it('mês sem nenhuma pendência: todos os itens ficam ok e warnings fica vazio', async () => {
    const prisma = makeFakePrisma({
      orders: { plain: 10, attention: 0, withoutFee: 0, settlementPending: 0 },
      returns: { plain: 2, pending: 0 },
      openInventoryCounts: 0,
      pendingRecurring: 0,
    });
    const fiscal = makeFakeFiscalService({
      saleInvoiceCount: 9,
      returnInvoiceCount: 2,
      xmlAvailableCount: 11,
      xmlUnavailableCount: 0,
    });

    const checklist = await buildMonthlyClosingChecklist(prisma, fiscal, 'company-1', '2026-08', RANGE.start, RANGE.end);

    expect(checklist.ordersCount).toBe(10);
    expect(checklist.returnsCount).toBe(2);
    expect(checklist.operational.every((i) => i.severity === 'ok')).toBe(true);
    expect(checklist.financial.every((i) => i.severity === 'ok')).toBe(true);
    expect(checklist.fiscal.items.every((i) => i.severity === 'ok')).toBe(true);
    expect(checklist.warnings).toHaveLength(0);
  });

  it('mês com pendências: cada item vira warning com contagem e link, e nenhum é bloqueante', async () => {
    const prisma = makeFakePrisma({
      orders: { plain: 139, attention: 2, withoutFee: 3, settlementPending: 4 },
      returns: { plain: 7, pending: 1 },
      openInventoryCounts: 1,
      pendingRecurring: 2,
    });
    const fiscal = makeFakeFiscalService({
      saleInvoiceCount: 132,
      returnInvoiceCount: 7,
      xmlAvailableCount: 137,
      xmlUnavailableCount: 2,
    });

    const checklist = await buildMonthlyClosingChecklist(prisma, fiscal, 'company-1', '2026-08', RANGE.start, RANGE.end);

    const ordersItem = checklist.operational.find((i) => i.key === 'orders_attention');
    expect(ordersItem).toMatchObject({
      severity: 'warning',
      detail: '2 pedidos precisam de atenção',
      link: '/vendas/pedidos?syncStatus=REQUIRES_MAPPING',
    });

    const returnsItem = checklist.operational.find((i) => i.key === 'returns_pending');
    expect(returnsItem).toMatchObject({ severity: 'warning', detail: '1 devolução pendente de processamento' });

    const inventoryItem = checklist.operational.find((i) => i.key === 'inventory_open_counts');
    expect(inventoryItem).toMatchObject({ severity: 'warning', detail: '1 contagem de estoque em aberto' });

    const feesItem = checklist.financial.find((i) => i.key === 'fees_reconciled');
    expect(feesItem).toMatchObject({ severity: 'warning', detail: '3 pedidos sem taxa de marketplace registrada' });

    const expensesItem = checklist.financial.find((i) => i.key === 'expenses_registered');
    expect(expensesItem).toMatchObject({ severity: 'warning', detail: '2 despesas recorrentes ainda não lançadas neste mês' });

    const settlementItem = checklist.financial.find((i) => i.key === 'settlement_pending');
    expect(settlementItem).toMatchObject({ severity: 'warning', detail: '4 pedidos aguardando liquidação' });
    // "Receitas processadas" não tem sinal de falha definido — nunca vira warning.
    expect(checklist.financial.find((i) => i.key === 'revenue_processed')).toMatchObject({ severity: 'ok' });

    const fiscalItem = checklist.fiscal.items.find((i) => i.key === 'fiscal_xml_pending');
    expect(fiscalItem).toMatchObject({ severity: 'warning', detail: '2 XMLs indisponíveis' });
    expect(checklist.fiscal.saleInvoiceCount).toBe(132);
    expect(checklist.fiscal.returnInvoiceCount).toBe(7);
    expect(checklist.fiscal.xmlUnavailableCount).toBe(2);

    // 3 operacionais + 3 financeiros (incluindo o extra de settlement) + 1 fiscal = 7 avisos.
    expect(checklist.warnings).toHaveLength(7);
    expect(checklist.warnings.every((w) => w.severity === 'warning')).toBe(true);
  });

  it('pluraliza corretamente quando a contagem é exatamente 1', async () => {
    const prisma = makeFakePrisma({
      orders: { plain: 5, attention: 1, withoutFee: 1, settlementPending: 1 },
      returns: { plain: 1, pending: 1 },
      openInventoryCounts: 1,
      pendingRecurring: 1,
    });
    const fiscal = makeFakeFiscalService({
      saleInvoiceCount: 4,
      returnInvoiceCount: 1,
      xmlAvailableCount: 4,
      xmlUnavailableCount: 1,
    });

    const checklist = await buildMonthlyClosingChecklist(prisma, fiscal, 'company-1', '2026-08', RANGE.start, RANGE.end);

    expect(checklist.operational.find((i) => i.key === 'orders_attention')?.detail).toBe('1 pedido precisa de atenção');
    expect(checklist.operational.find((i) => i.key === 'returns_pending')?.detail).toBe('1 devolução pendente de processamento');
    expect(checklist.operational.find((i) => i.key === 'inventory_open_counts')?.detail).toBe('1 contagem de estoque em aberto');
    expect(checklist.financial.find((i) => i.key === 'fees_reconciled')?.detail).toBe('1 pedido sem taxa de marketplace registrada');
    expect(checklist.financial.find((i) => i.key === 'expenses_registered')?.detail).toBe(
      '1 despesa recorrente ainda não lançada neste mês',
    );
    expect(checklist.financial.find((i) => i.key === 'settlement_pending')?.detail).toBe('1 pedido aguardando liquidação');
    expect(checklist.fiscal.items.find((i) => i.key === 'fiscal_xml_pending')?.detail).toBe('1 XML indisponível');
  });
});
