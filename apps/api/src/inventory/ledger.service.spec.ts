import type { Prisma } from '@ecommerce-manager/database';
import { InventoryLedgerService } from './ledger.service';

/**
 * Simula, sem um Postgres real, o cenário da seção 56: duas vendas concorrentes disputando
 * a última unidade em estoque. O "banco" é um objeto em memória compartilhado entre as duas
 * chamadas; `updateMany` só aplica a escrita se os valores lidos ainda baterem com o estado
 * atual (o mesmo compare-and-swap usado contra o Postgres real em produção) — se não baterem,
 * devolve `count: 0` e o ledger tenta de novo, exatamente como aconteceria com duas
 * transações reais disputando a mesma linha.
 */
function createFakeTransaction(initial: { onHand: number; reserved: number }) {
  const db = { ...initial };
  const movements: unknown[] = [];

  const tx = {
    inventory: {
      findUnique: async () => ({
        id: 'inv-1',
        companyId: 'company-1',
        variantId: 'variant-1',
        onHand: db.onHand,
        reserved: db.reserved,
        updatedAt: new Date(0),
      }),
      findUniqueOrThrow: async () => ({
        id: 'inv-1',
        companyId: 'company-1',
        variantId: 'variant-1',
        onHand: db.onHand,
        reserved: db.reserved,
        updatedAt: new Date(0),
      }),
      create: async () => {
        throw new Error('not expected in this test — inventory row already exists');
      },
      updateMany: async ({
        where,
        data,
      }: {
        where: { onHand: number; reserved: number };
        data: { onHand: number; reserved: number };
      }) => {
        if (where.onHand === db.onHand && where.reserved === db.reserved) {
          db.onHand = data.onHand;
          db.reserved = data.reserved;
          return { count: 1 };
        }
        return { count: 0 };
      },
    },
    inventoryMovement: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const movement = { id: `movement-${movements.length + 1}`, ...data };
        movements.push(movement);
        return movement;
      },
    },
  } as unknown as Prisma.TransactionClient;

  return { tx, db, movements };
}

describe('InventoryLedgerService — concorrência (seção 56)', () => {
  it('quando duas vendas concorrentes disputam a última unidade, só uma é aprovada e o estoque nunca fica negativo', async () => {
    const ledger = new InventoryLedgerService();
    const { tx, db } = createFakeTransaction({ onHand: 1, reserved: 0 });

    const ctx = {
      companyId: 'company-1',
      variantId: 'variant-1',
      referenceType: 'order',
      reason: 'venda concorrente (teste)',
    };

    const results = await Promise.allSettled([
      ledger.commitSale(tx, { ...ctx, referenceId: 'order-a' }, 1, false),
      ledger.commitSale(tx, { ...ctx, referenceId: 'order-b' }, 1, false),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason.message).toMatch(/negativo|insuficiente/i);

    // Estoque final nunca fica negativo, e reflete exatamente uma baixa aplicada.
    expect(db.onHand).toBe(0);
  });

  it('permite as duas operações quando há saldo suficiente para ambas', async () => {
    const ledger = new InventoryLedgerService();
    const { tx, db } = createFakeTransaction({ onHand: 5, reserved: 0 });

    const ctx = {
      companyId: 'company-1',
      variantId: 'variant-1',
      referenceType: 'order',
      reason: 'venda concorrente (teste)',
    };

    const results = await Promise.allSettled([
      ledger.commitSale(tx, { ...ctx, referenceId: 'order-a' }, 2, false),
      ledger.commitSale(tx, { ...ctx, referenceId: 'order-b' }, 2, false),
    ]);

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(2);
    expect(db.onHand).toBe(1);
  });
});

describe('InventoryLedgerService.commitSale — fromReservation nunca derruba reserved abaixo de zero', () => {
  it('baixa o físico normalmente quando fromReservation=true mas a variação nunca teve reserva de verdade (pedido histórico com skipStockMovement)', async () => {
    const ledger = new InventoryLedgerService();
    const { tx, db } = createFakeTransaction({ onHand: 1, reserved: 0 });

    const result = await ledger.commitSale(
      tx,
      { companyId: 'company-1', variantId: 'variant-1', referenceType: 'order', referenceId: 'order-a', reason: 'baixa no envio' },
      1,
      true,
    );

    expect(result.onHand).toBe(0);
    expect(result.reserved).toBe(0);
    expect(db.onHand).toBe(0);
    expect(db.reserved).toBe(0);
  });

  it('continua liberando a reserva normalmente quando ela existe de verdade', async () => {
    const ledger = new InventoryLedgerService();
    const { tx, db } = createFakeTransaction({ onHand: 3, reserved: 1 });

    await ledger.commitSale(
      tx,
      { companyId: 'company-1', variantId: 'variant-1', referenceType: 'order', referenceId: 'order-a', reason: 'baixa no envio' },
      1,
      true,
    );

    expect(db.onHand).toBe(2);
    expect(db.reserved).toBe(0);
  });
});
