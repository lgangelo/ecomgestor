import { Injectable } from '@nestjs/common';
import { OrderStatus, Prisma } from '@ecommerce-manager/database';
import { PrismaService } from '../common/prisma/prisma.service';
import { csvEscape } from '../common/csv.util';
import { endOfDayExclusive } from '../common/date/day-range.util';
import { FiscalService } from '../fiscal/fiscal.service';
import { DashboardQueryDto } from './dto/dashboard-query.dto';

interface PeriodOrder {
  id: string;
  total: Prisma.Decimal;
  discount: Prisma.Decimal;
  subtotal: Prisma.Decimal;
  shipping: Prisma.Decimal;
  status: OrderStatus;
  orderDate: Date;
  channel: { name: string };
  items: Array<{
    quantity: number;
    unitPrice: Prisma.Decimal;
    sellerDiscount: Prisma.Decimal;
    platformDiscount: Prisma.Decimal;
    unitCost: Prisma.Decimal;
    productNameAtSale: string;
  }>;
  fiscalDocuments: Array<{ id: string }>;
}

/** Item de "Precisa da sua atenção" (seção 63 da Fase 4) — só aparece quando count > 0. */
export interface AttentionItem {
  key: string;
  label: string;
  count: number;
  link: string;
}

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly fiscalService: FiscalService,
  ) {}

  async getDashboard(companyId: string, query: DashboardQueryDto) {
    const { start, end } = this.resolvePeriod(query.dateFrom, query.dateTo);
    const [orders, returnsAmount, attention, receivable] = await Promise.all([
      this.fetchOrders(companyId, start, end, query.channelId),
      this.fetchReturnsAmount(companyId, start, end, query.channelId),
      this.computeAttention(companyId),
      this.fetchReceivable(companyId),
    ]);
    const feesByOrderId = await this.fetchFeesByOrderId(orders);
    const current = { ...this.computeCards(orders, returnsAmount, feesByOrderId), receivable: round2(receivable) };
    const charts = this.computeCharts(orders, start, end, feesByOrderId);
    const alerts = await this.computeAlerts(companyId, orders, start, end);

    const result: Record<string, unknown> = { cards: current, charts, alerts, attention };

    if (query.compare === 'previous_period') {
      const lengthMs = end.getTime() - start.getTime();
      const prevEnd = new Date(start.getTime());
      const prevStart = new Date(start.getTime() - lengthMs);
      const [previousOrders, previousReturnsAmount] = await Promise.all([
        this.fetchOrders(companyId, prevStart, prevEnd, query.channelId),
        this.fetchReturnsAmount(companyId, prevStart, prevEnd, query.channelId),
      ]);
      const previousFeesByOrderId = await this.fetchFeesByOrderId(previousOrders);
      result.previous = this.computeCards(previousOrders, previousReturnsAmount, previousFeesByOrderId);
    }

    return result;
  }

  /**
   * Seção 63 — "Precisa da sua atenção": sinais operacionais acionáveis, cada um com link para a
   * tela onde o usuário resolve. Nunca inclui um item com contagem zero (evita ruído — seção 42).
   */
  private async computeAttention(companyId: string): Promise<AttentionItem[]> {
    const [inventories, fiscalPending, unmappedOrdersCount, tiktokSyncFailedCount] = await Promise.all([
      this.prisma.client.inventory.findMany({
        where: { companyId },
        select: { onHand: true, reserved: true, variant: { select: { minStock: true } } },
      }),
      this.fiscalService.getPending(companyId),
      this.prisma.client.order.count({ where: { companyId, integrationSyncStatus: 'REQUIRES_MAPPING' } }),
      this.prisma.client.syncJob.count({ where: { status: 'FAILED', integration: { companyId } } }),
    ]);

    // Mesmo critério de "abaixo do mínimo" do AlertsPanel — não dá para filtrar por uma
    // expressão (onHand - reserved) diretamente no Prisma, então compara em memória.
    const belowMinimumCount = inventories.filter((inv) => inv.onHand - inv.reserved < inv.variant.minStock).length;

    // Nunca `.length` das listas de exemplo — elas são limitadas a 50 pra exibição, então
    // sempre mostravam no máximo 50 mesmo quando o total real era maior. `salesWithoutInvoiceCount`/
    // `returnsWithoutDocumentCount` são contagens de verdade (sem limite).
    const fiscalPendingCount = fiscalPending.salesWithoutInvoiceCount + fiscalPending.returnsWithoutDocumentCount;

    const items: AttentionItem[] = [
      { key: 'low_stock', label: 'produtos com estoque baixo', count: belowMinimumCount, link: '/produtos/estoque' },
      { key: 'fiscal_pending', label: 'documentos fiscais pendentes', count: fiscalPendingCount, link: '/fiscal' },
      { key: 'tiktok_sync_failed', label: 'falha(s) de sincronização TikTok', count: tiktokSyncFailedCount, link: '/integracoes/tiktok' },
      {
        key: 'tiktok_unmapped',
        label: 'produtos TikTok sem vínculo',
        count: unmappedOrdersCount,
        link: '/vendas/pedidos?syncStatus=REQUIRES_MAPPING',
      },
    ];

    return items.filter((item) => item.count > 0);
  }

  private async fetchReturnsAmount(companyId: string, start: Date, end: Date, channelId?: string): Promise<number> {
    const agg = await this.prisma.client.refund.aggregate({
      where: {
        return: {
          order: { companyId, orderDate: { gte: start, lt: end }, ...(channelId ? { channelId } : {}) },
        },
      },
      _sum: { amount: true },
    });
    return Number(agg._sum.amount ?? 0);
  }

  /** "A receber" (seção 63) — ESTIMATIVA, não saldo oficial: confirmado via `check-settlements`
   * CLI que a TikTok não expõe em NENHUMA API (Statements, Payments, Transactions by Order) o
   * saldo ainda não repassado — ela só cria um registro financeiro depois que o dinheiro já se
   * moveu (extratos vêm quase sempre com payment_status PAID no mesmo dia). Em vez disso, estima
   * a partir dos próprios pedidos: soma a receita líquida dos pedidos de canal externo (TikTok)
   * ainda em aberto (PAID/PROCESSING/READY_TO_SHIP/SHIPPED) e desconta a taxa média histórica da
   * plataforma (16,045%, taxa real média — a taxa exata só é conhecida depois que o extrato
   * fecha). Saldo de conta corrente, não métrica de período — nunca filtrado pela janela de data
   * do dashboard, ao contrário dos outros cards.
   *
   * ACHADO REAL: recalibrado em 2026-09-05 comparando o valor mostrado aqui (R$ 2152,50, com os
   * 16% antigos) contra o saldo real informado pelo próprio TikTok (R$ 2151,34) — a diferença
   * implica uma taxa efetiva de ~16,045%, não 16% cravado. Baseado em UMA única observação (ainda
   * sujeito a ruído de arredondamento de um pedido só) — vale recalibrar de novo comparando mais
   * pedidos já liquidados, se a diferença voltar a aparecer.
   *
   * ACHADO REAL corrigido: `DELIVERED` NÃO significa "já liquidado" — existe atraso real entre a
   * entrega e o registro da taxa da plataforma (`MarketplaceFee`), então um pedido `DELIVERED`
   * sem nenhuma `MarketplaceFee` vinculada ainda está pendente de receber, na prática. Antes esses
   * pedidos eram excluídos assim que ficavam `DELIVERED`, subestimando "a receber". Agora entram
   * também — só saem da conta quando a taxa real é registrada (settlement fechado). */
  private static readonly RECEIVABLE_ESTIMATED_FEE_RATE = 0.16045;
  private static readonly RECEIVABLE_PENDING_STATUSES: OrderStatus[] = [
    OrderStatus.PAID,
    OrderStatus.PROCESSING,
    OrderStatus.READY_TO_SHIP,
    OrderStatus.SHIPPED,
  ];

  private async fetchReceivable(companyId: string): Promise<number> {
    const orders = await this.prisma.client.order.findMany({
      where: {
        companyId,
        externalOrderId: { not: null },
        OR: [
          { status: { in: ReportsService.RECEIVABLE_PENDING_STATUSES } },
          { status: OrderStatus.DELIVERED, marketplaceFees: { none: {} } },
        ],
      },
      select: { subtotal: true, shipping: true, items: { select: { sellerDiscount: true } } },
    });
    const netRevenue = orders.reduce((sum, o) => {
      const sellerDiscount = o.items.reduce((s, i) => s + Number(i.sellerDiscount), 0);
      return sum + Number(o.subtotal) + Number(o.shipping) - sellerDiscount;
    }, 0);
    return netRevenue * (1 - ReportsService.RECEIVABLE_ESTIMATED_FEE_RATE);
  }

  private resolvePeriod(dateFrom?: string, dateTo?: string): { start: Date; end: Date } {
    // `end` já é o limite EXCLUSIVO (início do dia seguinte) — todo uso deve ser `lt`, nunca
    // `lte` com a data crua (excluiria tudo criado depois da meia-noite do próprio dia "Até").
    const end = dateTo ? endOfDayExclusive(dateTo) : new Date();
    const start = dateFrom ? new Date(dateFrom) : new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);
    return { start, end };
  }

  /** Mapa orderId -> soma de MarketplaceFee — usado por computeCards/computeCharts para que o
   * lucro/margem aqui bata com o do detalhe do pedido (que já descontava a taxa da plataforma;
   * aqui não descontava nenhuma, deixando a margem do dashboard/relatórios superestimada). */
  private async fetchFeesByOrderId(orders: PeriodOrder[]): Promise<Map<string, number>> {
    if (orders.length === 0) return new Map();
    const grouped = await this.prisma.client.marketplaceFee.groupBy({
      by: ['orderId'],
      where: { orderId: { in: orders.map((o) => o.id) } },
      _sum: { amount: true },
    });
    return new Map(grouped.filter((g) => g.orderId).map((g) => [g.orderId as string, Number(g._sum.amount ?? 0)]));
  }

  private async fetchOrders(
    companyId: string,
    start: Date,
    end: Date,
    channelId?: string,
  ): Promise<PeriodOrder[]> {
    return this.prisma.client.order.findMany({
      where: {
        companyId,
        orderDate: { gte: start, lt: end },
        ...(channelId ? { channelId } : {}),
      },
      include: {
        channel: { select: { name: true } },
        // Nome do produto vem do snapshot da venda (productNameAtSale) — nunca do cadastro
        // atual, que pode ter mudado ou (para itens importados sem vínculo) nem existir.
        items: true,
        fiscalDocuments: { select: { id: true } },
      },
    });
  }

  private computeCards(orders: PeriodOrder[], returnsAmount: number, feesByOrderId: Map<string, number>) {
    // CANCELLED nunca conta; CREATED (pedido ainda não pago) também não — só é "venda de
    // verdade" depois de pago, então não deveria contar em nenhum número do dashboard (pedido
    // explícito do usuário: números não pagos não são "oficiais" o suficiente pra aparecer aqui).
    const active = orders.filter((o) => o.status !== OrderStatus.CANCELLED && o.status !== OrderStatus.CREATED);
    // `subtotal + shipping` (nunca `total`) é o valor bruto antes de qualquer desconto — `total`
    // já vem líquido dos dois descontos, então usá-lo aqui subtrairia o desconto do vendedor
    // duas vezes. Só o desconto do VENDEDOR entra como dedução: o desconto que a TikTok bancou
    // (promoção da plataforma) o vendedor recebe de volta no repasse, então nunca deveria sair
    // da receita (pedido explícito do usuário — `order.discount` combina os dois e por isso não
    // serve aqui, soma-se `sellerDiscount` item a item).
    const revenue = active.reduce((sum, o) => sum + Number(o.subtotal) + Number(o.shipping), 0);
    const discounts = active.reduce(
      (sum, o) => sum + o.items.reduce((s, i) => s + Number(i.sellerDiscount), 0),
      0,
    );
    const netRevenue = revenue - discounts - returnsAmount;
    const orderCount = active.length;
    const averageTicket = orderCount > 0 ? revenue / orderCount : 0;
    const cmv = active.reduce(
      (sum, o) => sum + o.items.reduce((s, i) => s + Number(i.unitCost) * i.quantity, 0),
      0,
    );
    // Taxa da plataforma (comissão TikTok) — sem isto, o lucro/margem aqui não batiam com o
    // "Lucro estimado" do detalhe do pedido, que sempre descontou a taxa (order.marketplaceFeesTotal).
    const fees = active.reduce((sum, o) => sum + (feesByOrderId.get(o.id) ?? 0), 0);
    const estimatedProfit = netRevenue - cmv - fees;
    // Margem = lucro sobre a venda (padrão contábil). Markup = lucro sobre o custo — sempre um
    // número maior que a margem para o mesmo lucro; nulo quando não há CMV no período (divisão
    // por zero, não "0%").
    const margin = revenue > 0 ? (estimatedProfit / revenue) * 100 : 0;
    const markup = cmv > 0 ? (estimatedProfit / cmv) * 100 : null;

    return {
      revenue: round2(revenue),
      netRevenue: round2(netRevenue),
      orders: orderCount,
      averageTicket: round2(averageTicket),
      estimatedProfit: round2(estimatedProfit),
      margin: round2(margin),
      markup: markup === null ? null : round2(markup),
    };
  }

  private computeCharts(orders: PeriodOrder[], start: Date, end: Date, feesByOrderId: Map<string, number>) {
    // Mesmo critério de computeCards — pedido ainda não pago não é número oficial.
    const active = orders.filter((o) => o.status !== OrderStatus.CANCELLED && o.status !== OrderStatus.CREATED);

    // Seção 30 — gráfico principal por dia quando o período é curto, por semana ISO quando é
    // longo (evita um gráfico ilegível de 6 meses de barras diárias).
    const spanDays = Math.max(1, Math.round((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)));
    const useWeeklyBuckets = spanDays > 45;
    const bucketOf = (date: Date) => (useWeeklyBuckets ? isoWeekKey(date) : date.toISOString().slice(0, 10));

    // Mesma base de receita usada no card "Receita líquida" (computeCards): subtotal + frete -
    // desconto do vendedor (o da TikTok nunca sai da receita, é reembolsado no repasse) — antes
    // este gráfico e o de canais somavam `order.total`, que é líquido dos DOIS descontos, então
    // o total somado aqui nunca batia com o card equivalente pro mesmo período (a diferença era
    // exatamente o desconto da TikTok do período). `unitPrice` já vem líquido dos dois descontos
    // (seção 15 do mapper), então soma-se de volta só o da TikTok — nunca o do vendedor.
    const orderRevenue = (order: PeriodOrder) =>
      order.items.reduce((s, i) => s + Number(i.unitPrice) * i.quantity + Number(i.platformDiscount), 0) +
      Number(order.shipping);

    const revenueByBucket = new Map<string, { total: number; cmv: number; fees: number }>();
    const ordersByDay = new Map<string, number>();
    for (const order of active) {
      const bucket = bucketOf(order.orderDate);
      const entry = revenueByBucket.get(bucket) ?? { total: 0, cmv: 0, fees: 0 };
      entry.total += orderRevenue(order);
      entry.cmv += order.items.reduce((s, i) => s + Number(i.unitCost) * i.quantity, 0);
      entry.fees += feesByOrderId.get(order.id) ?? 0;
      revenueByBucket.set(bucket, entry);

      const day = order.orderDate.toISOString().slice(0, 10);
      ordersByDay.set(day, (ordersByDay.get(day) ?? 0) + 1);
    }

    // Gráfico principal (seção 30): faturamento x resultado — um único gráfico, sem separar em
    // vários cards (seção 62/30: "evitar excesso de gráficos"). "Resultado" desconta CMV e taxa
    // da plataforma — sem a taxa, ficava sempre superestimado em relação ao lucro real.
    const revenueByPeriod = Array.from(revenueByBucket.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, stats]) => ({ date, total: round2(stats.total), result: round2(stats.total - stats.cmv - stats.fees) }));

    const salesByDay = Array.from(ordersByDay.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, count]) => ({ date, orders: count }));

    // Seção 31 — canais com ticket médio/lucro/margem, não só faturamento. Inclui a taxa da
    // plataforma (comissão) — sem isto, lucro/margem por canal e por produto ficavam
    // superestimados (nunca descontavam a taxa, ao contrário do "Lucro estimado" do pedido).
    const channelStats = new Map<string, { total: number; cmv: number; orders: number; fees: number }>();
    const productStats = new Map<string, { quantity: number; revenue: number; cmv: number; fees: number }>();
    for (const order of active) {
      const orderFee = feesByOrderId.get(order.id) ?? 0;

      const channelKey = order.channel.name;
      const channelEntry = channelStats.get(channelKey) ?? { total: 0, cmv: 0, orders: 0, fees: 0 };
      channelEntry.total += orderRevenue(order);
      channelEntry.cmv += order.items.reduce((s, i) => s + Number(i.unitCost) * i.quantity, 0);
      channelEntry.orders += 1;
      channelEntry.fees += orderFee;
      channelStats.set(channelKey, channelEntry);

      // A taxa é só do PEDIDO (a TikTok não devolve por item) — rateia entre os itens
      // proporcionalmente à receita de cada um, mesmo critério já usado para custos extras nas
      // Entradas de Estoque (rateio por valor). Sem frete aqui (diferente de `orderRevenue`
      // acima) — o rateio é só entre os ITENS do pedido, frete não é atribuível a um item.
      const orderItemsRevenue = order.items.reduce(
        (s, i) => s + Number(i.unitPrice) * i.quantity + Number(i.platformDiscount),
        0,
      );
      for (const item of order.items) {
        const name = item.productNameAtSale;
        const entry = productStats.get(name) ?? { quantity: 0, revenue: 0, cmv: 0, fees: 0 };
        entry.quantity += item.quantity;
        // `unitPrice` já vem líquido dos dois descontos — soma-se de volta o da TikTok.
        const itemRevenue = Number(item.unitPrice) * item.quantity + Number(item.platformDiscount);
        entry.revenue += itemRevenue;
        entry.cmv += Number(item.unitCost) * item.quantity;
        entry.fees += orderItemsRevenue > 0 ? orderFee * (itemRevenue / orderItemsRevenue) : 0;
        productStats.set(name, entry);
      }
    }
    const totalRevenueAllChannels = Array.from(channelStats.values()).reduce((sum, c) => sum + c.total, 0);
    const salesByChannel = Array.from(channelStats.entries())
      .sort(([, a], [, b]) => b.total - a.total)
      .map(([channelName, stats]) => {
        const profit = stats.total - stats.cmv - stats.fees;
        return {
          channelName,
          total: round2(stats.total),
          orders: stats.orders,
          averageTicket: stats.orders > 0 ? round2(stats.total / stats.orders) : 0,
          profit: round2(profit),
          marginPercent: stats.total > 0 ? round2((profit / stats.total) * 100) : 0,
          markupPercent: stats.cmv > 0 ? round2((profit / stats.cmv) * 100) : null,
          share: totalRevenueAllChannels > 0 ? round2((stats.total / totalRevenueAllChannels) * 100) : 0,
        };
      });

    const topProducts = Array.from(productStats.entries())
      .sort(([, a], [, b]) => b.revenue - a.revenue)
      .slice(0, 10)
      .map(([productName, stats]) => ({
        productName,
        quantity: stats.quantity,
        revenue: round2(stats.revenue),
      }));

    const marginByProduct = Array.from(productStats.entries())
      .map(([productName, stats]) => ({
        productName,
        marginPercent: stats.revenue > 0 ? round2(((stats.revenue - stats.cmv - stats.fees) / stats.revenue) * 100) : 0,
      }))
      .sort((a, b) => b.marginPercent - a.marginPercent)
      .slice(0, 10);

    // Seção 26 — cortes complementares além de "mais vendidos".
    const highestProfit = Array.from(productStats.entries())
      .map(([productName, stats]) => ({ productName, profit: round2(stats.revenue - stats.cmv - stats.fees) }))
      .sort((a, b) => b.profit - a.profit)
      .slice(0, 10);

    const lowestMargin = Array.from(productStats.entries())
      .filter(([, stats]) => stats.revenue > 0)
      .map(([productName, stats]) => ({
        productName,
        marginPercent: round2(((stats.revenue - stats.cmv - stats.fees) / stats.revenue) * 100),
      }))
      .sort((a, b) => a.marginPercent - b.marginPercent)
      .slice(0, 10);

    // Seção 32 — ranking unificado com alternância cliente-side (mais vendido/maior lucro/menor
    // margem), mantendo os cortes antigos acima por compatibilidade. Limitado a 50 produtos:
    // suficiente para um catálogo de e-commerce gerencial sem devolver o catálogo inteiro.
    const products = Array.from(productStats.entries())
      .map(([productName, stats]) => ({
        productName,
        quantity: stats.quantity,
        revenue: round2(stats.revenue),
        profit: round2(stats.revenue - stats.cmv - stats.fees),
        marginPercent: stats.revenue > 0 ? round2(((stats.revenue - stats.cmv - stats.fees) / stats.revenue) * 100) : 0,
        markupPercent: stats.cmv > 0 ? round2(((stats.revenue - stats.cmv - stats.fees) / stats.cmv) * 100) : null,
      }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 50);

    return {
      revenueByPeriod,
      salesByDay,
      salesByChannel,
      products,
      topProducts,
      marginByProduct,
      highestProfit,
      lowestMargin,
    };
  }

  private async computeAlerts(companyId: string, orders: PeriodOrder[], start: Date, end: Date) {
    void start;
    void end;

    const inventories = await this.prisma.client.inventory.findMany({
      where: { companyId },
      include: { variant: { select: { sku: true, minStock: true, product: { select: { name: true } } } } },
    });
    const belowMinimumStock = inventories
      .filter((inv) => inv.onHand - inv.reserved < inv.variant.minStock)
      .map((inv) => ({
        sku: inv.variant.sku,
        productName: inv.variant.product.name,
        available: inv.onHand - inv.reserved,
        minStock: inv.variant.minStock,
      }));

    const cancelledOrders = orders.filter((o) => o.status === OrderStatus.CANCELLED).length;
    // Pedido ainda não pago (CREATED) não é uma venda de verdade ainda — não deveria aparecer
    // como "venda sem NF-e" (não tem NF-e porque não tem venda confirmada, não por pendência).
    const salesWithoutFiscalDocument = orders.filter(
      (o) => o.status !== OrderStatus.CANCELLED && o.status !== OrderStatus.CREATED && o.fiscalDocuments.length === 0,
    ).length;

    const integrations = await this.prisma.client.integration.findMany({ where: { companyId } });
    const dayMs = 24 * 60 * 60 * 1000;
    const integrationDelayed = integrations.some(
      (i) => i.status === 'CONNECTED' && (!i.lastSyncAt || Date.now() - i.lastSyncAt.getTime() > dayMs),
    );

    return { belowMinimumStock, cancelledOrders, salesWithoutFiscalDocument, integrationDelayed };
  }
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** Chave de semana ISO (ex.: "2026-W35") — usada para agrupar o gráfico principal (seção 30)
 * quando o período selecionado é longo demais para um bucket por dia. */
function isoWeekKey(date: Date): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = (d.getUTCDay() + 6) % 7; // segunda-feira = 0
  d.setUTCDate(d.getUTCDate() - dayNum + 3); // quinta-feira da mesma semana ISO
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const firstThursdayDayNum = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstThursdayDayNum + 3);
  const week = 1 + Math.round((d.getTime() - firstThursday.getTime()) / (7 * 24 * 60 * 60 * 1000));
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

@Injectable()
export class SalesExportService {
  constructor(private readonly prisma: PrismaService) {}

  /** Exportação de vendas em CSV (seção 40), uma linha por item de pedido. */
  async buildSalesCsv(companyId: string, dateFrom?: string, dateTo?: string): Promise<string> {
    const orders = await this.prisma.client.order.findMany({
      where: {
        companyId,
        ...(dateFrom || dateTo
          ? {
              orderDate: {
                ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
                ...(dateTo ? { lt: endOfDayExclusive(dateTo) } : {}),
              },
            }
          : {}),
      },
      include: {
        channel: { select: { name: true } },
        items: true,
        fiscalDocuments: { select: { number: true }, take: 1 },
      },
      orderBy: { orderDate: 'asc' },
    });

    const orderIds = orders.map((o) => o.id);
    const fees = await this.prisma.client.marketplaceFee.groupBy({
      by: ['orderId'],
      where: { orderId: { in: orderIds } },
      _sum: { amount: true },
    });
    const feesByOrder = new Map(fees.map((f) => [f.orderId, Number(f._sum.amount ?? 0)]));

    const header = [
      'Data',
      'Pedido',
      'Canal',
      'SKU',
      'Produto',
      'Quantidade',
      'Preco',
      'Desconto vendedor',
      'Desconto TikTok',
      'Receita liquida',
      'CMV',
      'Taxas',
      'Lucro',
      'Status',
      'NF-e',
    ];
    const rows = [header.join(';')];

    for (const order of orders) {
      const orderFees = feesByOrder.get(order.id) ?? 0;
      const nfe = order.fiscalDocuments[0]?.number ?? '';
      for (const item of order.items) {
        // `unitPrice` já vem líquido dos dois descontos — soma-se de volta o da TikTok (o do
        // vendedor já está embutido). "Desconto vendedor"/"Desconto TikTok" saem como colunas
        // informativas separadas, não entram nesta conta.
        const netRevenue = Number(item.unitPrice) * item.quantity + Number(item.platformDiscount);
        const cmv = Number(item.unitCost) * item.quantity;
        const itemShareOfFees = order.items.length > 0 ? orderFees / order.items.length : 0;
        const profit = netRevenue - cmv - itemShareOfFees;

        rows.push(
          [
            order.orderDate.toISOString().slice(0, 10),
            order.externalOrderId ?? order.id,
            order.channel.name,
            item.skuAtSale,
            item.productNameAtSale,
            String(item.quantity),
            Number(item.unitPrice).toFixed(2),
            Number(item.sellerDiscount).toFixed(2),
            Number(item.platformDiscount).toFixed(2),
            netRevenue.toFixed(2),
            cmv.toFixed(2),
            itemShareOfFees.toFixed(2),
            profit.toFixed(2),
            order.status,
            nfe,
          ]
            .map((v) => csvEscape(String(v)))
            .join(';'),
        );
      }
    }

    return rows.join('\n');
  }
}
