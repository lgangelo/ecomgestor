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
  items: Array<{
    quantity: number;
    unitPrice: number;
    sellerDiscount: number;
    platformDiscount: number;
    unitCost: number;
    productNameAtSale: string;
  }>;
  payments: Array<{ amount: number; status: string }>;
  fiscalDocuments: Array<{ id: string }>;
}

interface FakePrismaConfig {
  orders: FakeOrder[];
  returnsAmount: number;
  inventories: Array<{ onHand: number; reserved: number; variant: { sku: string; minStock: number; product: { name: string } } }>;
  integrations: Array<{ status: string; lastSyncAt: Date | null }>;
  unmappedOrdersCount: number;
  syncJobFailedCount: number;
}

function makeFakePrisma(config: FakePrismaConfig): PrismaService {
  const orderFindMany = async ({ where }: { where: { orderDate: { gte: Date; lt: Date }; channelId?: string } }) => {
    return config.orders
      .filter((o) => o.orderDate >= where.orderDate.gte && o.orderDate < where.orderDate.lt)
      .filter((o) => !where.channelId || o.channelId === where.channelId);
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
      syncJob: { count: async () => config.syncJobFailedCount },
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
    items: [],
    payments: [],
    fiscalDocuments: [],
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
    });
    const fiscal = makeFakeFiscalService({ salesWithoutInvoice: [{ id: '1' }, { id: '2' }], returnsWithoutDocument: [] });
    const service = new ReportsService(prisma, fiscal);

    const result = await service.getDashboard('company-1', { dateFrom: '2026-08-01', dateTo: '2026-08-31' });
    const attention = (result as { attention: Array<{ key: string; count: number }> }).attention;
    const byKey = new Map(attention.map((a) => [a.key, a.count]));

    expect(byKey.get('low_stock')).toBe(1);
    expect(byKey.get('fiscal_pending')).toBe(2);
    expect(byKey.get('tiktok_unmapped')).toBe(3);
    expect(byKey.has('tiktok_sync_failed')).toBe(false); // count 0 nunca aparece (seção 63)
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
});
