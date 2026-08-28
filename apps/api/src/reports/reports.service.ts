import { Injectable } from '@nestjs/common';
import { OrderStatus, Prisma } from '@ecommerce-manager/database';
import { PrismaService } from '../common/prisma/prisma.service';
import { DashboardQueryDto } from './dto/dashboard-query.dto';

interface PeriodOrder {
  id: string;
  total: Prisma.Decimal;
  status: OrderStatus;
  orderDate: Date;
  channel: { name: string };
  items: Array<{
    quantity: number;
    unitPrice: Prisma.Decimal;
    discount: Prisma.Decimal;
    unitCost: Prisma.Decimal;
    variant: { product: { name: string } };
  }>;
  payments: Array<{ amount: Prisma.Decimal; status: string }>;
  fiscalDocuments: Array<{ id: string }>;
}

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async getDashboard(companyId: string, query: DashboardQueryDto) {
    const { start, end } = this.resolvePeriod(query.dateFrom, query.dateTo);
    const orders = await this.fetchOrders(companyId, start, end, query.channelId);
    const current = this.computeCards(orders);
    const charts = this.computeCharts(orders);
    const alerts = await this.computeAlerts(companyId, orders, start, end);

    const result: Record<string, unknown> = { cards: current, charts, alerts };

    if (query.compare === 'previous_period') {
      const lengthMs = end.getTime() - start.getTime();
      const prevEnd = new Date(start.getTime());
      const prevStart = new Date(start.getTime() - lengthMs);
      const previousOrders = await this.fetchOrders(companyId, prevStart, prevEnd, query.channelId);
      result.previous = this.computeCards(previousOrders);
    }

    return result;
  }

  private resolvePeriod(dateFrom?: string, dateTo?: string): { start: Date; end: Date } {
    const end = dateTo ? new Date(dateTo) : new Date();
    const start = dateFrom ? new Date(dateFrom) : new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);
    return { start, end };
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
        orderDate: { gte: start, lte: end },
        ...(channelId ? { channelId } : {}),
      },
      include: {
        channel: { select: { name: true } },
        items: {
          include: { variant: { select: { product: { select: { name: true } } } } },
        },
        payments: { select: { amount: true, status: true } },
        fiscalDocuments: { select: { id: true } },
      },
    });
  }

  private computeCards(orders: PeriodOrder[]) {
    const active = orders.filter((o) => o.status !== OrderStatus.CANCELLED);
    const revenue = active.reduce((sum, o) => sum + Number(o.total), 0);
    const orderCount = active.length;
    const averageTicket = orderCount > 0 ? revenue / orderCount : 0;
    const cmv = active.reduce(
      (sum, o) => sum + o.items.reduce((s, i) => s + Number(i.unitCost) * i.quantity, 0),
      0,
    );
    const receivable = orders.reduce(
      (sum, o) =>
        sum + o.payments.filter((p) => p.status === 'PENDING').reduce((s, p) => s + Number(p.amount), 0),
      0,
    );
    const estimatedProfit = revenue - cmv;
    const margin = revenue > 0 ? (estimatedProfit / revenue) * 100 : 0;

    return {
      revenue: round2(revenue),
      orders: orderCount,
      averageTicket: round2(averageTicket),
      estimatedProfit: round2(estimatedProfit),
      margin: round2(margin),
      receivable: round2(receivable),
    };
  }

  private computeCharts(orders: PeriodOrder[]) {
    const active = orders.filter((o) => o.status !== OrderStatus.CANCELLED);

    const revenueByDay = new Map<string, number>();
    const ordersByDay = new Map<string, number>();
    for (const order of active) {
      const day = order.orderDate.toISOString().slice(0, 10);
      revenueByDay.set(day, (revenueByDay.get(day) ?? 0) + Number(order.total));
      ordersByDay.set(day, (ordersByDay.get(day) ?? 0) + 1);
    }

    const revenueByPeriod = Array.from(revenueByDay.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, total]) => ({ date, total: round2(total) }));

    const salesByDay = Array.from(ordersByDay.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, count]) => ({ date, orders: count }));

    const revenueByChannel = new Map<string, number>();
    for (const order of active) {
      const key = order.channel.name;
      revenueByChannel.set(key, (revenueByChannel.get(key) ?? 0) + Number(order.total));
    }
    const salesByChannel = Array.from(revenueByChannel.entries())
      .sort(([, a], [, b]) => b - a)
      .map(([channelName, total]) => ({ channelName, total: round2(total) }));

    const productStats = new Map<string, { quantity: number; revenue: number; cmv: number }>();
    for (const order of active) {
      for (const item of order.items) {
        const name = item.variant.product.name;
        const entry = productStats.get(name) ?? { quantity: 0, revenue: 0, cmv: 0 };
        entry.quantity += item.quantity;
        entry.revenue += Number(item.unitPrice) * item.quantity - Number(item.discount);
        entry.cmv += Number(item.unitCost) * item.quantity;
        productStats.set(name, entry);
      }
    }

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
        marginPercent: stats.revenue > 0 ? round2(((stats.revenue - stats.cmv) / stats.revenue) * 100) : 0,
      }))
      .sort((a, b) => b.marginPercent - a.marginPercent)
      .slice(0, 10);

    return { revenueByPeriod, salesByDay, salesByChannel, topProducts, marginByProduct };
  }

  private async computeAlerts(companyId: string, orders: PeriodOrder[], start: Date, end: Date) {
    void start;
    void end;

    const inventories = await this.prisma.client.inventory.findMany({
      where: { companyId },
      include: { variant: { select: { sku: true, minStock: true, product: { select: { name: true } } } } },
    });
    const belowMinimumStock = inventories
      .filter((inv) => inv.available < inv.variant.minStock)
      .map((inv) => ({
        sku: inv.variant.sku,
        productName: inv.variant.product.name,
        available: inv.available,
        minStock: inv.variant.minStock,
      }));

    const cancelledOrders = orders.filter((o) => o.status === OrderStatus.CANCELLED).length;
    const salesWithoutFiscalDocument = orders.filter(
      (o) => o.status !== OrderStatus.CANCELLED && o.fiscalDocuments.length === 0,
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
