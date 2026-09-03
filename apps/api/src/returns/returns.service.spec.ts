import { BadRequestException } from '@nestjs/common';
import { OrderStatus, RefundType, ReturnStatus } from '@ecommerce-manager/database';
import { ReturnsService } from './returns.service';
import type { PrismaService } from '../common/prisma/prisma.service';
import type { InventoryLedgerService } from '../inventory/ledger.service';

const COMPANY_ID = 'company-1';
const ORDER_ID = 'order-1';
const ORDER_ITEM_ID = 'item-1';

function makeService(overrides: {
  orderStatus?: OrderStatus;
  soldQuantity?: number;
  priorReturnItems?: Array<{ orderItemId: string; quantity: number }>;
  orderTotal?: number;
  priorRefundedAmount?: number;
}) {
  const order = {
    id: ORDER_ID,
    status: overrides.orderStatus ?? OrderStatus.DELIVERED,
    total: overrides.orderTotal ?? 100,
    items: [{ id: ORDER_ITEM_ID, quantity: overrides.soldQuantity ?? 2, skuAtSale: 'SKU-1', variantId: 'variant-1' }],
  };

  const prisma = {
    client: {
      order: { findFirst: jest.fn().mockResolvedValue(order) },
      returnItem: { findMany: jest.fn().mockResolvedValue(overrides.priorReturnItems ?? []) },
      return: {
        findFirst: jest.fn().mockResolvedValue({ id: 'return-1', orderId: ORDER_ID, status: ReturnStatus.REQUESTED, order }),
      },
      refund: {
        aggregate: jest.fn().mockResolvedValue({ _sum: { amount: overrides.priorRefundedAmount ?? 0 } }),
      },
      $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          return: {
            create: jest.fn().mockResolvedValue({ id: 'return-1', items: [] }),
          },
          order: { update: jest.fn() },
          orderStatusHistory: { create: jest.fn() },
          refund: { create: jest.fn().mockResolvedValue({ id: 'refund-1' }) },
        }),
      ),
    },
  };

  const ledger = { restock: jest.fn() };

  const service = new ReturnsService(prisma as unknown as PrismaService, ledger as unknown as InventoryLedgerService);
  return { service, prisma, ledger };
}

describe('ReturnsService.create — validações contra duplicidade/estado', () => {
  it('rejeita abrir devolução num pedido que nunca foi enviado (ainda CREATED)', async () => {
    const { service } = makeService({ orderStatus: OrderStatus.CREATED });

    await expect(
      service.create(ORDER_ID, COMPANY_ID, 'user-1', { items: [{ orderItemId: ORDER_ITEM_ID, quantity: 1 }] }),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejeita devolver mais do que ainda resta, somando devoluções anteriores não rejeitadas', async () => {
    const { service } = makeService({
      soldQuantity: 5,
      priorReturnItems: [{ orderItemId: ORDER_ITEM_ID, quantity: 3 }],
    });

    // Só restam 2 (5 vendidas - 3 já devolvidas) — pedir 3 de novo deve falhar.
    await expect(
      service.create(ORDER_ID, COMPANY_ID, 'user-1', { items: [{ orderItemId: ORDER_ITEM_ID, quantity: 3 }] }),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejeita duplicar o mesmo item na mesma requisição somando as quantidades', async () => {
    const { service } = makeService({ soldQuantity: 2 });

    // 1 + 1 = 2 linhas somando o mesmo orderItemId, ultrapassando as 2 vendidas em conjunto com
    // qualquer devolução futura — aqui já bate exatamente no limite (2), então testa 2+1=3.
    await expect(
      service.create(ORDER_ID, COMPANY_ID, 'user-1', {
        items: [
          { orderItemId: ORDER_ITEM_ID, quantity: 2 },
          { orderItemId: ORDER_ITEM_ID, quantity: 1 },
        ],
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('permite devolver dentro do que ainda resta', async () => {
    const { service } = makeService({
      soldQuantity: 5,
      priorReturnItems: [{ orderItemId: ORDER_ITEM_ID, quantity: 3 }],
    });

    await expect(
      service.create(ORDER_ID, COMPANY_ID, 'user-1', { items: [{ orderItemId: ORDER_ITEM_ID, quantity: 2 }] }),
    ).resolves.toBeDefined();
  });
});

describe('ReturnsService.createRefund — teto de valor e transição de status', () => {
  it('rejeita reembolsar um pedido que nunca foi enviado/devolvido (ainda PAID)', async () => {
    const { service } = makeService({ orderStatus: OrderStatus.PAID });

    await expect(
      service.createRefund('return-1', COMPANY_ID, 'user-1', { type: RefundType.FULL, amount: 50 }),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejeita reembolso que excede o total do pedido somado a reembolsos já processados', async () => {
    const { service } = makeService({
      orderStatus: OrderStatus.RETURN_REQUESTED,
      orderTotal: 100,
      priorRefundedAmount: 80,
    });

    // 80 já reembolsado + 30 novos = 110, excede os 100 do pedido.
    await expect(
      service.createRefund('return-1', COMPANY_ID, 'user-1', { type: RefundType.PARTIAL, amount: 30 }),
    ).rejects.toThrow(BadRequestException);
  });

  it('permite reembolso dentro do valor restante', async () => {
    const { service } = makeService({
      orderStatus: OrderStatus.RETURN_REQUESTED,
      orderTotal: 100,
      priorRefundedAmount: 80,
    });

    await expect(
      service.createRefund('return-1', COMPANY_ID, 'user-1', { type: RefundType.PARTIAL, amount: 20 }),
    ).resolves.toBeDefined();
  });
});
