import type { PrismaService } from '../common/prisma/prisma.service';
import type { FiscalService } from '../fiscal/fiscal.service';
import { ReportsService } from './reports.service';

interface FakeOrder {
  id: string;
  total: number;
  discount: number;
  subtotal: number;
  shipping: number;
  status: string;
  orderDate: Date;
  channelId: string;
  channel: { name: string };
  externalOrderId: string | null;
  items: Array<{
    quantity: number;
    unitPrice: number;
    sellerDiscount: number;
    platformDiscount: number;
    unitCost: number;
    productNameAtSale: string;
  }>;
  fiscalDocuments: Array<{ id: string }>;
  marketplaceFees: Array<{ id: string }>;
}

interface FakePrismaConfig {
  orders: FakeOrder[];
  returnsAmount: number;
  inventories: Array<{ onHand: number; reserved: number; variant: { sku: string; minStock: number; product: { name: string } } }>;
  integrations: Array<{ status: string; lastSyncAt: Date | null }>;
  unmappedOrdersCount: number;
  syncJobFailedCount: number;
  mercadoLivreSyncJobFailedCount?: number;
  productsWithoutPhotoCount?: number;
}

function makeFakePrisma(config: FakePrismaConfig): PrismaService {
  // Duas formas de `where` batem aqui: a busca por PERÍODO (`fetchOrders`, com `orderDate`/
  // `channelId`) e a estimativa de "a receber" (`fetchReceivable`, com `externalOrderId`/`status.in`,
  // sem filtro de data — é um saldo de conta corrente, não uma métrica de período).
  interface OrClause {
    status?: { in: string[] } | string;
    marketplaceFees?: { none: object };
  }
  const matchesOrClause = (o: FakeOrder, clause: OrClause): boolean => {
    if (clause.status && typeof clause.status === 'object') return clause.status.in.includes(o.status);
    if (typeof clause.status === 'string') {
      if (o.status !== clause.status) return false;
      if (clause.marketplaceFees?.none) return o.marketplaceFees.length === 0;
      return true;
    }
    return false;
  };
  const orderFindMany = async ({
    where,
  }: {
    where: {
      orderDate?: { gte: Date; lt: Date };
      channelId?: string;
      externalOrderId?: { not: null };
      status?: { in: string[] };
      OR?: OrClause[];
    };
  }) => {
    return config.orders
      .filter((o) => !where.orderDate || (o.orderDate >= where.orderDate.gte && o.orderDate < where.orderDate.lt))
      .filter((o) => !where.channelId || o.channelId === where.channelId)
      .filter((o) => !where.externalOrderId || o.externalOrderId !== null)
      .filter((o) => !where.status?.in || where.status.in.includes(o.status))
      .filter((o) => !where.OR || where.OR.some((clause) => matchesOrClause(o, clause)));
  };

  return {
    client: {
      order: {
        findMany: orderFindMany,
        count: async () => config.unmappedOrdersCount,
      },
      refund: { aggregate: async () => ({ _sum: { amount: config.returnsAmount } }) },
      marketplaceFee: { groupBy: async () => [] },
      inventory: { findMany: async () => config.inventories },
      integration: { findMany: async () => config.integrations },
      product: { count: async () => config.productsWithoutPhotoCount ?? 0 },
      syncJob: {
        count: async ({ where }: { where: { integration?: { provider?: string } } }) =>
          where.integration?.provider === 'MERCADO_LIVRE'
            ? (config.mercadoLivreSyncJobFailedCount ?? 0)
            : config.syncJobFailedCount,
      },
    },
  } as unknown as PrismaService;
}

function makeFakeFiscalService(pending: { salesWithoutInvoice: unknown[]; returnsWithoutDocument: unknown[] }): FiscalService {
  return {
    getPending: async () => ({
      ...pending,
      salesWithoutInvoiceCount: pending.salesWithoutInvoice.length,
      returnsWithoutDocumentCount: pending.returnsWithoutDocument.length,
    }),
  } as unknown as FiscalService;
}

function order(overrides: Partial<FakeOrder>): FakeOrder {
  return {
    id: 'order-1',
    total: 100,
    discount: 0,
    subtotal: 100,
    shipping: 0,
    status: 'DELIVERED',
    orderDate: new Date('2026-08-10T12:00:00Z'),
    channelId: 'ch-1',
    channel: { name: 'TikTok' },
    externalOrderId: null,
    items: [],
    fiscalDocuments: [],
    marketplaceFees: [],
    ...overrides,
  };
}

describe('ReportsService.getDashboard (Fase 4, item C)', () => {
  it('cards: receita líquida e lucro estimado descontam discount e devoluções', async () => {
    const orders = [
      order({
        id: 'o1',
        total: 195,
        discount: 10,
        subtotal: 200,
        shipping: 0,
        // platformDiscount (5) é a promoção que a TikTok bancou — o vendedor recebe esse valor
        // de volta no repasse, então não deve reduzir a receita (só sellerDiscount reduz).
        items: [{ quantity: 2, unitPrice: 100, sellerDiscount: 10, platformDiscount: 5, unitCost: 40, productNameAtSale: 'Bolsa' }],
      }),
    ];
    const prisma = makeFakePrisma({
      orders,
      returnsAmount: 20,
      inventories: [],
      integrations: [],
      unmappedOrdersCount: 0,
      syncJobFailedCount: 0,
    });
    const fiscal = makeFakeFiscalService({ salesWithoutInvoice: [], returnsWithoutDocument: [] });
    const service = new ReportsService(prisma, fiscal);

    const result = await service.getDashboard('company-1', { dateFrom: '2026-08-01', dateTo: '2026-08-31' });
    const cards = (result as { cards: Record<string, number> }).cards;

    // netRevenue = 200 (subtotal+frete) - 10 (desconto do vendedor, NUNCA o da TikTok) - 20 (devoluções) = 170
    expect(cards.netRevenue).toBe(170);
    // cmv = 2 * 40 = 80; lucro estimado = netRevenue - cmv = 90
    expect(cards.estimatedProfit).toBe(90);
  });

  it('canais: ticket médio, lucro e participação (%) calculados por canal', async () => {
    const orders = [
      order({
        id: 'o1',
        channelId: 'ch-tiktok',
        channel: { name: 'TikTok' },
        total: 300,
        items: [{ quantity: 1, unitPrice: 300, sellerDiscount: 0, platformDiscount: 0, unitCost: 100, productNameAtSale: 'Bolsa' }],
      }),
      order({
        id: 'o2',
        channelId: 'ch-insta',
        channel: { name: 'Instagram' },
        total: 100,
        items: [{ quantity: 1, unitPrice: 100, sellerDiscount: 0, platformDiscount: 0, unitCost: 50, productNameAtSale: 'Bolsa' }],
      }),
    ];
    const prisma = makeFakePrisma({
      orders,
      returnsAmount: 0,
      inventories: [],
      integrations: [],
      unmappedOrdersCount: 0,
      syncJobFailedCount: 0,
    });
    const fiscal = makeFakeFiscalService({ salesWithoutInvoice: [], returnsWithoutDocument: [] });
    const service = new ReportsService(prisma, fiscal);

    const result = await service.getDashboard('company-1', { dateFrom: '2026-08-01', dateTo: '2026-08-31' });
    const salesByChannel = (
      result as { charts: { salesByChannel: Array<{ channelName: string; averageTicket: number; profit: number; share: number }> } }
    ).charts.salesByChannel;

    const tiktok = salesByChannel.find((c) => c.channelName === 'TikTok');
    expect(tiktok).toMatchObject({ averageTicket: 300, profit: 200, share: 75 });
    const instagram = salesByChannel.find((c) => c.channelName === 'Instagram');
    expect(instagram).toMatchObject({ averageTicket: 100, profit: 50, share: 25 });
  });

  it(
    'ACHADO REAL corrigido: falhas de sincronização do TikTok e do Mercado Livre contam separado — ' +
      'antes, qualquer SyncJob FAILED da empresa (de qualquer canal) virava "falha de sincronização TikTok"',
    async () => {
      const prisma = makeFakePrisma({
        orders: [],
        returnsAmount: 0,
        inventories: [],
        integrations: [],
        unmappedOrdersCount: 0,
        syncJobFailedCount: 3, // TikTok
        mercadoLivreSyncJobFailedCount: 29, // Mercado Livre — nunca deveria aparecer como TikTok
      });
      const fiscal = makeFakeFiscalService({ salesWithoutInvoice: [], returnsWithoutDocument: [] });
      const service = new ReportsService(prisma, fiscal);

      const result = await service.getDashboard('company-1', { dateFrom: '2026-08-01', dateTo: '2026-08-31' });
      const attention = (result as { attention: Array<{ key: string; count: number }> }).attention;
      const byKey = new Map(attention.map((a) => [a.key, a.count]));

      expect(byKey.get('tiktok_sync_failed')).toBe(3);
      expect(byKey.get('mercadolivre_sync_failed')).toBe(29);
    },
  );

  it('precisa da sua atenção: só lista itens com contagem > 0', async () => {
    const prisma = makeFakePrisma({
      orders: [],
      returnsAmount: 0,
      inventories: [
        { onHand: 1, reserved: 0, variant: { sku: 'SKU-1', minStock: 5, product: { name: 'Baixo estoque' } } },
        { onHand: 10, reserved: 0, variant: { sku: 'SKU-2', minStock: 2, product: { name: 'Estoque ok' } } },
      ],
      integrations: [],
      unmappedOrdersCount: 3,
      syncJobFailedCount: 0,
      productsWithoutPhotoCount: 7,
    });
    const fiscal = makeFakeFiscalService({ salesWithoutInvoice: [{ id: '1' }, { id: '2' }], returnsWithoutDocument: [] });
    const service = new ReportsService(prisma, fiscal);

    const result = await service.getDashboard('company-1', { dateFrom: '2026-08-01', dateTo: '2026-08-31' });
    const attention = (result as { attention: Array<{ key: string; count: number }> }).attention;
    const byKey = new Map(attention.map((a) => [a.key, a.count]));

    expect(byKey.get('low_stock')).toBe(1);
    expect(byKey.get('fiscal_pending')).toBe(2);
    expect(byKey.get('tiktok_unmapped')).toBe(3);
    // Pedido do usuário (tela de tarefas operacionais): produtos ativos sem foto de capa.
    expect(byKey.get('products_without_photo')).toBe(7);
    expect(byKey.has('tiktok_sync_failed')).toBe(false); // count 0 nunca aparece (seção 63)
  });

  it('getAttention expõe a mesma lista de "precisa da sua atenção" como página dedicada (tela de tarefas operacionais)', async () => {
    const prisma = makeFakePrisma({
      orders: [],
      returnsAmount: 0,
      inventories: [],
      integrations: [],
      unmappedOrdersCount: 0,
      syncJobFailedCount: 0,
      productsWithoutPhotoCount: 5,
    });
    const fiscal = makeFakeFiscalService({ salesWithoutInvoice: [], returnsWithoutDocument: [] });
    const service = new ReportsService(prisma, fiscal);

    const attention = await service.getAttention('company-1');

    expect(attention.find((a) => a.key === 'products_without_photo')?.count).toBe(5);
  });

  it('gráfico principal e canais reconciliam com o card de receita líquida (mesma base: nunca soma order.total)', async () => {
    const orders = [
      order({
        id: 'o1',
        // subtotal = unitPrice*qty + sellerDiscount + platformDiscount = 100*2 + 10 + 5 = 215
        // (mesma fórmula de `importExternalOrder`/`createManualSale` — sellerDiscount/
        // platformDiscount são valores da LINHA inteira, não por unidade).
        total: 210,
        subtotal: 215,
        shipping: 10,
        // sellerDiscount reduz a receita; platformDiscount (bancado pela TikTok) nunca deveria
        // sair nem do card nem do gráfico nem do canal — antes desta correção, o gráfico e o
        // canal somavam `order.total` (líquido dos DOIS descontos), então nunca batiam com o
        // card "Receita líquida" (que só desconta o do vendedor) pro mesmo período.
        items: [{ quantity: 2, unitPrice: 100, sellerDiscount: 10, platformDiscount: 5, unitCost: 40, productNameAtSale: 'Bolsa' }],
      }),
    ];
    const prisma = makeFakePrisma({
      orders,
      returnsAmount: 0,
      inventories: [],
      integrations: [],
      unmappedOrdersCount: 0,
      syncJobFailedCount: 0,
    });
    const fiscal = makeFakeFiscalService({ salesWithoutInvoice: [], returnsWithoutDocument: [] });
    const service = new ReportsService(prisma, fiscal);

    const result = await service.getDashboard('company-1', { dateFrom: '2026-08-01', dateTo: '2026-08-31' });
    const { cards, charts } = result as {
      cards: { netRevenue: number };
      charts: {
        revenueByPeriod: Array<{ total: number }>;
        salesByChannel: Array<{ total: number }>;
      };
    };

    // netRevenue = (subtotal 215 + frete 10) - sellerDiscount 10 - devoluções 0 = 215
    expect(cards.netRevenue).toBe(215);
    expect(charts.revenueByPeriod[0].total).toBe(cards.netRevenue);
    expect(charts.salesByChannel[0].total).toBe(cards.netRevenue);
  });

  it('gráfico principal: agrupa por semana ISO quando o período é longo (> 45 dias)', async () => {
    const orders = [
      order({ id: 'o1', orderDate: new Date('2026-06-01T00:00:00Z'), total: 50 }),
      order({ id: 'o2', orderDate: new Date('2026-08-20T00:00:00Z'), total: 50 }),
    ];
    const prisma = makeFakePrisma({
      orders,
      returnsAmount: 0,
      inventories: [],
      integrations: [],
      unmappedOrdersCount: 0,
      syncJobFailedCount: 0,
    });
    const fiscal = makeFakeFiscalService({ salesWithoutInvoice: [], returnsWithoutDocument: [] });
    const service = new ReportsService(prisma, fiscal);

    const result = await service.getDashboard('company-1', { dateFrom: '2026-06-01', dateTo: '2026-08-31' });
    const revenueByPeriod = (result as { charts: { revenueByPeriod: Array<{ date: string }> } }).charts.revenueByPeriod;

    expect(revenueByPeriod.every((p) => /^\d{4}-W\d{2}$/.test(p.date))).toBe(true);
  });

  it('"a receber": estimativa pelos pedidos TikTok em aberto + DELIVERED sem taxa registrada, descontada a taxa média de 16,045%, nunca o filtro de período', async () => {
    const orders = [
      // Fora da janela filtrada e ainda assim conta — é saldo de conta corrente, não métrica de período.
      order({
        id: 'shipped-1',
        status: 'SHIPPED',
        externalOrderId: 'tt-1',
        orderDate: new Date('2020-01-01T00:00:00Z'),
        subtotal: 200,
        shipping: 10,
        items: [{ quantity: 2, unitPrice: 100, sellerDiscount: 10, platformDiscount: 0, unitCost: 40, productNameAtSale: 'Bolsa' }],
      }),
      // ACHADO REAL corrigido: DELIVERED não significa liquidado — sem MarketplaceFee registrada
      // ainda, o pedido continua pendente de receber.
      order({ id: 'delivered-sem-taxa', status: 'DELIVERED', externalOrderId: 'tt-4', subtotal: 300, shipping: 0 }),
      // DELIVERED com taxa já registrada (settlement fechado) — esse sim já foi liquidado, sai da conta.
      order({
        id: 'delivered-com-taxa',
        status: 'DELIVERED',
        externalOrderId: 'tt-2',
        subtotal: 500,
        shipping: 0,
        marketplaceFees: [{ id: 'fee-1' }],
      }),
      // Venda manual (sem externalOrderId) não passa pelo repasse da plataforma — nunca entra.
      order({ id: 'manual-1', status: 'SHIPPED', externalOrderId: null, subtotal: 500, shipping: 0 }),
      // CREATED nunca é venda de verdade.
      order({ id: 'created-1', status: 'CREATED', externalOrderId: 'tt-3', subtotal: 500, shipping: 0 }),
    ];
    const prisma = makeFakePrisma({
      orders,
      returnsAmount: 0,
      inventories: [],
      integrations: [],
      unmappedOrdersCount: 0,
      syncJobFailedCount: 0,
    });
    const fiscal = makeFakeFiscalService({ salesWithoutInvoice: [], returnsWithoutDocument: [] });
    const service = new ReportsService(prisma, fiscal);

    const result = await service.getDashboard('company-1', { dateFrom: '2026-08-01', dateTo: '2026-08-31' });
    const cards = (result as { cards: Record<string, number> }).cards;

    // netRevenue = shipped-1 (200 + 10 - 10 = 200) + delivered-sem-taxa (300 + 0 - 0 = 300) = 500;
    // estimativa = 500 * (1 - 0.16045) = 419,775.
    expect(cards.receivable).toBeCloseTo(419.775, 2);
  });
});
