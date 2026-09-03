import { InventoryCountService } from './inventory-count.service';
import type { PrismaService } from '../common/prisma/prisma.service';
import type { InventoryLedgerService } from './ledger.service';

const COMPANY_ID = 'company-1';
const COUNT_ID = 'count-1';
const VARIANT_ID = 'variant-1';

function makeService(opts: { systemQuantity: number; countedQuantity: number; currentOnHand: number }) {
  const count = {
    id: COUNT_ID,
    companyId: COMPANY_ID,
    status: 'OPEN',
    items: [
      {
        id: 'item-1',
        variantId: VARIANT_ID,
        systemQuantity: opts.systemQuantity,
        countedQuantity: opts.countedQuantity,
        difference: opts.countedQuantity - opts.systemQuantity,
      },
    ],
  };

  const adjust = jest.fn();
  const txInventoryFindMany = jest.fn().mockResolvedValue([{ variantId: VARIANT_ID, onHand: opts.currentOnHand }]);
  const tx = {
    inventory: { findMany: txInventoryFindMany },
    inventoryCount: { update: jest.fn() },
  };

  const prisma = {
    client: {
      inventoryCount: { findFirst: jest.fn().mockResolvedValue(count) },
      $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(tx)),
    },
  };

  const ledger = { adjust };
  const service = new InventoryCountService(prisma as unknown as PrismaService, ledger as unknown as InventoryLedgerService);
  return { service, adjust, prisma };
}

describe('InventoryCountService.complete — recalcula contra o saldo ATUAL, nunca o congelado', () => {
  it('não gera ajuste fantasma quando o estoque já mudou legitimamente durante a contagem (venda no meio do processo)', async () => {
    // Contagem começou com onHand=100 (congelado). Uma venda legítima debitou 10 durante a
    // contagem (onHand atual = 90). O contador achou 90 na prateleira — bateu exatamente com a
    // realidade atual, mesmo divergindo do saldo congelado do início (100).
    const { service, adjust } = makeService({ systemQuantity: 100, countedQuantity: 90, currentOnHand: 90 });

    await service.complete(COUNT_ID, COMPANY_ID, 'user-1');

    // Não deveria ajustar nada — o saldo atual já bate com o que foi contado.
    expect(adjust).not.toHaveBeenCalled();
  });

  it('gera ajuste pelo delta real (contra o saldo atual), não pelo delta congelado do início', async () => {
    // Mesma contagem congelada em 100, mas o estoque atual é 95 (alguma outra movimentação) e o
    // contador achou 90 de verdade — o ajuste real precisa ser -5 (95 -> 90), não -10 (100 -> 90).
    const { service, adjust } = makeService({ systemQuantity: 100, countedQuantity: 90, currentOnHand: 95 });

    await service.complete(COUNT_ID, COMPANY_ID, 'user-1');

    expect(adjust).toHaveBeenCalledTimes(1);
    const [, , delta] = adjust.mock.calls[0];
    expect(delta).toBe(-5);
  });
});
