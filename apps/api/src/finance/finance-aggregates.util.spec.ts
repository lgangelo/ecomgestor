import { computeFinanceAggregates } from './finance-aggregates.util';
import type { PrismaService } from '../common/prisma/prisma.service';

function makePrisma() {
  const orderAggregate = jest.fn().mockResolvedValue({ _sum: { subtotal: 1000, shipping: 50 } });
  const prisma = {
    client: {
      order: { aggregate: orderAggregate },
      orderItem: {
        aggregate: jest.fn().mockResolvedValue({ _sum: { sellerDiscount: 0 } }),
        findMany: jest.fn().mockResolvedValue([]),
      },
      refund: { aggregate: jest.fn().mockResolvedValue({ _sum: { amount: 0 } }) },
      marketplaceFee: { aggregate: jest.fn().mockResolvedValue({ _sum: { amount: 0 } }) },
      expense: { findMany: jest.fn().mockResolvedValue([]) },
      taxConfiguration: { findFirst: jest.fn().mockResolvedValue(null) },
    },
  };
  return { prisma, orderAggregate };
}

describe('computeFinanceAggregates — pedido nao pago nunca conta como receita', () => {
  it('exclui CANCELLED e CREATED do filtro de pedidos, igual ao dashboard e as pendencias fiscais', async () => {
    const { prisma, orderAggregate } = makePrisma();

    await computeFinanceAggregates(
      prisma as unknown as PrismaService,
      'company-1',
      new Date('2026-08-01'),
      new Date('2026-09-01'),
    );

    const callArgs = orderAggregate.mock.calls[0][0];
    expect(callArgs.where.status).toEqual({ notIn: ['CANCELLED', 'CREATED'] });
  });
});
