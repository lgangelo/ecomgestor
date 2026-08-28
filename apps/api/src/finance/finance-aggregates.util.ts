import { PrismaService } from '../common/prisma/prisma.service';

export interface FinanceAggregates {
  grossRevenue: number;
  discounts: number;
  returnsAmount: number;
  netRevenue: number;
  cmv: number;
  grossProfit: number;
  fees: number;
  marketing: number;
  packaging: number;
  otherExpenses: number;
  estimatedTaxes: number;
  managementResult: number;
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * Retorna o primeiro instante (00:00:00.000 UTC) do mês corrente e o primeiro instante
 * do mês seguinte, usado como limite exclusivo do período padrão de fechamento/overview.
 */
export function getCurrentMonthRange(reference = new Date()): { start: Date; end: Date } {
  const start = new Date(Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth(), 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth() + 1, 1, 0, 0, 0, 0));
  return { start, end };
}

/** Converte 'YYYY-MM' no intervalo [primeiro dia do mês, primeiro dia do mês seguinte) em UTC. */
export function getMonthRangeFromReference(referenceMonth: string): { start: Date; end: Date } {
  const match = /^(\d{4})-(\d{2})$/.exec(referenceMonth);
  if (!match) {
    throw new Error(`referenceMonth inválido: ${referenceMonth}. Formato esperado: YYYY-MM`);
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const start = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0));
  return { start, end };
}

/**
 * Calcula os agregados financeiros gerenciais (não fiscais/contábeis) para uma empresa
 * em um intervalo [start, end). Reaproveitado tanto pelo overview quanto pelo fechamento mensal.
 */
export async function computeFinanceAggregates(
  prisma: PrismaService,
  companyId: string,
  start: Date,
  end: Date,
): Promise<FinanceAggregates> {
  const orderWhere = {
    companyId,
    orderDate: { gte: start, lt: end },
    status: { not: 'CANCELLED' as const },
  };

  const [orderAgg, refundAgg, feeAgg, orderItems, expenses] = await Promise.all([
    prisma.client.order.aggregate({
      where: orderWhere,
      _sum: { total: true, discount: true },
    }),
    prisma.client.refund.aggregate({
      where: { return: { order: { companyId, orderDate: { gte: start, lt: end } } } },
      _sum: { amount: true },
    }),
    prisma.client.marketplaceFee.aggregate({
      where: { order: { companyId, orderDate: { gte: start, lt: end } } },
      _sum: { amount: true },
    }),
    prisma.client.orderItem.findMany({
      where: { order: orderWhere },
      select: { quantity: true, unitCost: true },
    }),
    prisma.client.expense.findMany({
      where: { companyId, date: { gte: start, lt: end } },
      select: { amount: true, category: { select: { name: true } } },
    }),
  ]);

  const grossRevenue = Number(orderAgg._sum.total ?? 0);
  const discounts = Number(orderAgg._sum.discount ?? 0);
  const returnsAmount = Number(refundAgg._sum.amount ?? 0);
  const fees = Number(feeAgg._sum.amount ?? 0);

  const cmv = orderItems.reduce((sum, item) => sum + Number(item.unitCost) * item.quantity, 0);

  let marketing = 0;
  let packaging = 0;
  let estimatedTaxes = 0;
  let otherExpenses = 0;

  for (const expense of expenses) {
    const amount = Number(expense.amount);
    switch (expense.category.name) {
      case 'Marketing':
        marketing += amount;
        break;
      case 'Embalagem':
        packaging += amount;
        break;
      case 'Impostos':
        estimatedTaxes += amount;
        break;
      default:
        otherExpenses += amount;
        break;
    }
  }

  const netRevenue = grossRevenue - discounts - returnsAmount;
  const grossProfit = netRevenue - cmv;
  const managementResult = grossProfit - fees - marketing - packaging - otherExpenses - estimatedTaxes;

  return {
    grossRevenue: round2(grossRevenue),
    discounts: round2(discounts),
    returnsAmount: round2(returnsAmount),
    netRevenue: round2(netRevenue),
    cmv: round2(cmv),
    grossProfit: round2(grossProfit),
    fees: round2(fees),
    marketing: round2(marketing),
    packaging: round2(packaging),
    otherExpenses: round2(otherExpenses),
    estimatedTaxes: round2(estimatedTaxes),
    managementResult: round2(managementResult),
  };
}
