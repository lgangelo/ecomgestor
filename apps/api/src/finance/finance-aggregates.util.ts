import { PrismaService } from '../common/prisma/prisma.service';

export { getCurrentMonthRange, getMonthRangeFromReference } from '../common/date/month-range.util';

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
 * Retorna a alíquota estimada vigente na data de referência (seção 29) — nunca hardcoded.
 * Se a empresa não tiver nenhuma configuração cadastrada, a estimativa é 0 (e o DRE deixa
 * isso implícito ao mostrar "Impostos estimados: R$ 0,00").
 */
export async function getVigentTaxRate(
  prisma: PrismaService,
  companyId: string,
  referenceDate: Date,
): Promise<number> {
  const config = await prisma.client.taxConfiguration.findFirst({
    where: {
      companyId,
      validFrom: { lte: referenceDate },
      OR: [{ validTo: null }, { validTo: { gte: referenceDate } }],
    },
    orderBy: { validFrom: 'desc' },
  });
  return config ? Number(config.estimatedRate) : 0;
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

  const [orderAgg, discountAgg, refundAgg, feeAgg, orderItems, expenses, taxRate] = await Promise.all([
    // `subtotal + shipping` (nunca `total`) é o valor bruto ANTES de qualquer desconto — `total`
    // já vem líquido dos dois descontos (seção 15 do mapper), então usá-lo aqui subtrairia o
    // desconto do vendedor duas vezes e ainda descontaria o da TikTok, que não deveria sair da
    // receita (ver comentário de `discountAgg` abaixo).
    prisma.client.order.aggregate({
      where: orderWhere,
      _sum: { subtotal: true, shipping: true },
    }),
    // Só o desconto dado pelo PRÓPRIO vendedor reduz a receita gerencial — o desconto que a
    // TikTok bancou (promoção da plataforma) o vendedor recebe de volta no repasse, então nunca
    // deveria sair da receita aqui (pedido explícito do usuário: "os da plataforma não, pq a
    // gente recebe o valor do desconto na plataforma"). `order.discount` combina os dois e por
    // isso não serve para esta conta — soma-se `sellerDiscount` direto do item.
    prisma.client.orderItem.aggregate({
      where: { order: orderWhere },
      _sum: { sellerDiscount: true },
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
      where: { companyId, date: { gte: start, lt: end }, status: { not: 'CANCELLED' } },
      select: { amount: true, category: { select: { name: true } } },
    }),
    getVigentTaxRate(prisma, companyId, start),
  ]);

  const grossRevenue = Number(orderAgg._sum.subtotal ?? 0) + Number(orderAgg._sum.shipping ?? 0);
  const discounts = Number(discountAgg._sum.sellerDiscount ?? 0);
  const returnsAmount = Number(refundAgg._sum.amount ?? 0);
  const fees = Number(feeAgg._sum.amount ?? 0);

  const cmv = orderItems.reduce((sum, item) => sum + Number(item.unitCost) * item.quantity, 0);

  let marketing = 0;
  let packaging = 0;
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
        // Pagamentos reais de imposto não entram na despesa gerencial — o DRE usa a
        // estimativa configurável (estimatedTaxes) para esta linha, não o valor pago.
        break;
      default:
        otherExpenses += amount;
        break;
    }
  }

  const netRevenue = grossRevenue - discounts - returnsAmount;
  const grossProfit = netRevenue - cmv;
  const estimatedTaxes = netRevenue * taxRate;
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
