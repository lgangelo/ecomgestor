import { PrismaService } from '../common/prisma/prisma.service';
import { FiscalService } from '../fiscal/fiscal.service';

export type ChecklistSeverity = 'ok' | 'warning';

export interface ChecklistItem {
  key: string;
  label: string;
  severity: ChecklistSeverity;
  /** Só presente quando severity === 'warning' — mensagem com a contagem (seção 21/22 da Fase 4). */
  detail?: string;
  /** Tela gerencial correspondente para o usuário resolver a pendência (seção 21: "clicar deve
   * abrir a lista correspondente"). */
  link?: string;
}

export interface FiscalChecklist {
  saleInvoiceCount: number;
  returnInvoiceCount: number;
  xmlAvailableCount: number;
  xmlUnavailableCount: number;
  items: ChecklistItem[];
}

export interface MonthlyClosingChecklist {
  ordersCount: number;
  returnsCount: number;
  operational: ChecklistItem[];
  financial: ChecklistItem[];
  fiscal: FiscalChecklist;
  /**
   * Todos os itens com severity 'warning', achatados — usados no resumo de confirmação (seção 25)
   * e persistidos em `warningsSnapshot` ao fechar (seção 27). Nenhum item é bloqueante nesta fase:
   * a especificação não define nenhuma condição de bloqueio, só avisos (decisão registrada em
   * docs/phase4-review.md).
   */
  warnings: ChecklistItem[];
}

function plural(count: number, singular: string, pluralForm: string): string {
  return count === 1 ? singular : pluralForm;
}

/**
 * Monta o checklist ao vivo do fechamento mensal (seções 20-24 da Fase 4): reaproveita o mesmo
 * resumo fiscal já usado pela tela Fiscal (`FiscalService.getMonthlySummary`) para nunca ter dois
 * lugares calculando "documentos pendentes" de formas diferentes.
 */
export async function buildMonthlyClosingChecklist(
  prisma: PrismaService,
  fiscalService: FiscalService,
  companyId: string,
  referenceMonth: string,
  start: Date,
  end: Date,
): Promise<MonthlyClosingChecklist> {
  const [
    ordersCount,
    attentionOrdersCount,
    returnsCount,
    pendingReturnsCount,
    openInventoryCounts,
    ordersWithoutFeeCount,
    pendingRecurringCount,
    settlementPendingOrdersCount,
    fiscalSummary,
  ] = await Promise.all([
    prisma.client.order.count({
      where: { companyId, orderDate: { gte: start, lt: end }, status: { not: 'CANCELLED' } },
    }),
    // Pedidos que ainda precisam de resolução manual de vínculo/erro de sincronização (seção 15
    // da Fase 3) — é o sinal real de "pedido precisa de atenção" (seção 21).
    prisma.client.order.count({
      where: {
        companyId,
        orderDate: { gte: start, lt: end },
        integrationSyncStatus: { in: ['REQUIRES_MAPPING', 'ERROR'] },
      },
    }),
    prisma.client.return.count({ where: { order: { companyId }, requestedAt: { gte: start, lt: end } } }),
    prisma.client.return.count({
      where: {
        order: { companyId },
        requestedAt: { gte: start, lt: end },
        status: { in: ['REQUESTED', 'APPROVED'] },
      },
    }),
    // Contagem física em aberto (seção 21: "estoque atualizado") — o ledger é sempre síncrono e
    // nunca fica "pendente" por natureza; o sinal real de algo não confirmado é uma contagem
    // física iniciada e ainda não concluída.
    prisma.client.inventoryCount.count({ where: { companyId, status: 'OPEN' } }),
    prisma.client.order.count({
      where: {
        companyId,
        orderDate: { gte: start, lt: end },
        status: { not: 'CANCELLED' },
        marketplaceFees: { none: {} },
      },
    }),
    prisma.client.recurringExpenseTemplate.count({
      where: { companyId, isActive: true, expenses: { none: { competenceDate: start } } },
    }),
    prisma.client.order.count({
      where: {
        companyId,
        orderDate: { gte: start, lt: end },
        settlementTx: { some: { settlement: { status: { in: ['PENDING', 'PARTIALLY_SETTLED'] } } } },
      },
    }),
    fiscalService.getMonthlySummary(companyId, referenceMonth),
  ]);

  const operational: ChecklistItem[] = [
    attentionOrdersCount > 0
      ? {
          key: 'orders_attention',
          label: 'Pedidos conciliados',
          severity: 'warning',
          detail: `${attentionOrdersCount} ${plural(attentionOrdersCount, 'pedido precisa', 'pedidos precisam')} de atenção`,
          link: '/vendas/pedidos?syncStatus=REQUIRES_MAPPING',
        }
      : { key: 'orders_attention', label: 'Pedidos conciliados', severity: 'ok' },
    pendingReturnsCount > 0
      ? {
          key: 'returns_pending',
          label: 'Devoluções processadas',
          severity: 'warning',
          detail: `${pendingReturnsCount} ${plural(pendingReturnsCount, 'devolução pendente', 'devoluções pendentes')} de processamento`,
          link: '/vendas/devolucoes',
        }
      : { key: 'returns_pending', label: 'Devoluções processadas', severity: 'ok' },
    openInventoryCounts > 0
      ? {
          key: 'inventory_open_counts',
          label: 'Estoque atualizado',
          severity: 'warning',
          detail: `${openInventoryCounts} ${plural(openInventoryCounts, 'contagem de estoque em aberto', 'contagens de estoque em aberto')}`,
          link: '/produtos/estoque',
        }
      : { key: 'inventory_open_counts', label: 'Estoque atualizado', severity: 'ok' },
  ];

  const financial: ChecklistItem[] = [
    // Nenhum sinal de falha real conhecido para "receitas processadas" — o agregado financeiro já
    // inclui todo pedido não cancelado do período por construção (ver computeFinanceAggregates).
    { key: 'revenue_processed', label: 'Receitas processadas', severity: 'ok' },
    ordersWithoutFeeCount > 0
      ? {
          key: 'fees_reconciled',
          label: 'Taxas conciliadas',
          severity: 'warning',
          detail: `${ordersWithoutFeeCount} ${plural(ordersWithoutFeeCount, 'pedido sem', 'pedidos sem')} taxa de marketplace registrada`,
          link: '/financeiro/taxas',
        }
      : { key: 'fees_reconciled', label: 'Taxas conciliadas', severity: 'ok' },
    pendingRecurringCount > 0
      ? {
          key: 'expenses_registered',
          label: 'Despesas cadastradas',
          severity: 'warning',
          detail: `${pendingRecurringCount} ${plural(pendingRecurringCount, 'despesa recorrente ainda não lançada', 'despesas recorrentes ainda não lançadas')} neste mês`,
          link: '/financeiro/despesas',
        }
      : { key: 'expenses_registered', label: 'Despesas cadastradas', severity: 'ok' },
  ];
  if (settlementPendingOrdersCount > 0) {
    // Aviso extra, não substitui nenhum dos 3 itens acima (seção 22) — e nunca bloqueia o
    // fechamento (seção 22: "Isso não necessariamente deve impedir fechamento").
    financial.push({
      key: 'settlement_pending',
      label: 'Liquidação de repasses',
      severity: 'warning',
      detail: `${settlementPendingOrdersCount} ${plural(settlementPendingOrdersCount, 'pedido aguardando', 'pedidos aguardando')} liquidação`,
      link: '/financeiro/receitas',
    });
  }

  const fiscalItems: ChecklistItem[] =
    fiscalSummary.xmlUnavailableCount > 0
      ? [
          {
            key: 'fiscal_xml_pending',
            label: 'XML disponível',
            severity: 'warning',
            detail: `${fiscalSummary.xmlUnavailableCount} ${plural(fiscalSummary.xmlUnavailableCount, 'XML indisponível', 'XMLs indisponíveis')}`,
            link: '/fiscal',
          },
        ]
      : [{ key: 'fiscal_xml_pending', label: 'XML disponível', severity: 'ok' }];

  const fiscal: FiscalChecklist = {
    saleInvoiceCount: fiscalSummary.saleInvoiceCount,
    returnInvoiceCount: fiscalSummary.returnInvoiceCount,
    xmlAvailableCount: fiscalSummary.xmlAvailableCount,
    xmlUnavailableCount: fiscalSummary.xmlUnavailableCount,
    items: fiscalItems,
  };

  const warnings = [...operational, ...financial, ...fiscalItems].filter((item) => item.severity === 'warning');

  return { ordersCount, returnsCount, operational, financial, fiscal, warnings };
}
