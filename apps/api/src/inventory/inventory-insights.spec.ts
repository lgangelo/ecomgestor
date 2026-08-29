import type { PrismaService } from '../common/prisma/prisma.service';
import type { InventoryLedgerService } from './ledger.service';
import { InventoryService } from './inventory.service';

interface FakeInventoryRow {
  variantId: string;
  onHand: number;
  reserved: number;
  variant: {
    sku: string;
    minStock: number;
    product: { name: string };
    costHistory: Array<{ cost: number }>;
  };
}

interface FakeSalesSignal {
  variantId: string;
  lastSaleAt: Date | null;
  qty30d: number;
}

function makeFakePrisma(
  company: { slowMovingDays: number; restockCoverageDays: number },
  rows: FakeInventoryRow[],
  salesSignals: FakeSalesSignal[],
): PrismaService {
  return {
    client: {
      company: { findUniqueOrThrow: async () => company },
      inventory: { findMany: async () => rows },
      $queryRaw: async () => salesSignals,
    },
  } as unknown as PrismaService;
}

function makeService(prisma: PrismaService): InventoryService {
  return new InventoryService(prisma, {} as unknown as InventoryLedgerService);
}

const now = Date.now();
const daysAgo = (n: number) => new Date(now - n * 24 * 60 * 60 * 1000);

describe('InventoryService.getInsights (Fase 4, seções 33-36)', () => {
  it('estoque parado: sem venda nunca registrada ou venda além do limite configurado', async () => {
    const rows: FakeInventoryRow[] = [
      {
        variantId: 'v-never-sold',
        onHand: 10,
        reserved: 0,
        variant: { sku: 'SKU-1', minStock: 0, product: { name: 'Nunca vendido' }, costHistory: [{ cost: 5 }] },
      },
      {
        variantId: 'v-old-sale',
        onHand: 5,
        reserved: 0,
        variant: { sku: 'SKU-2', minStock: 0, product: { name: 'Venda antiga' }, costHistory: [{ cost: 10 }] },
      },
      {
        variantId: 'v-recent-sale',
        onHand: 5,
        reserved: 0,
        variant: { sku: 'SKU-3', minStock: 0, product: { name: 'Venda recente' }, costHistory: [{ cost: 10 }] },
      },
      {
        variantId: 'v-zero-stock',
        onHand: 0,
        reserved: 0,
        variant: { sku: 'SKU-4', minStock: 0, product: { name: 'Sem estoque' }, costHistory: [] },
      },
    ];
    const salesSignals: FakeSalesSignal[] = [
      { variantId: 'v-old-sale', lastSaleAt: daysAgo(90), qty30d: 0 },
      { variantId: 'v-recent-sale', lastSaleAt: daysAgo(5), qty30d: 3 },
    ];
    const service = makeService(makeFakePrisma({ slowMovingDays: 60, restockCoverageDays: 14 }, rows, salesSignals));

    const insights = await service.getInsights('company-1');

    const skus = insights.slowMoving.map((i) => i.sku);
    expect(skus).toContain('SKU-1');
    expect(skus).toContain('SKU-2');
    expect(skus).not.toContain('SKU-3');
    expect(skus).not.toContain('SKU-4'); // onHand 0 nunca entra (seção 33)

    const neverSold = insights.slowMoving.find((i) => i.sku === 'SKU-1');
    expect(neverSold?.daysSinceLastSale).toBeNull();
    expect(neverSold?.lastSaleAt).toBeNull();
  });

  it('sugestão de reposição: abaixo do mínimo OU cobertura menor que o limite configurado', async () => {
    const rows: FakeInventoryRow[] = [
      {
        // Abaixo do mínimo, mesmo com boa cobertura.
        variantId: 'v-below-min',
        onHand: 2,
        reserved: 0,
        variant: { sku: 'SKU-A', minStock: 5, product: { name: 'Abaixo do mínimo' }, costHistory: [] },
      },
      {
        // Cobertura baixa: 10 disponível / (30 vendidas em 30 dias / 30) = 10 dias de cobertura.
        variantId: 'v-low-coverage',
        onHand: 10,
        reserved: 0,
        variant: { sku: 'SKU-B', minStock: 0, product: { name: 'Cobertura baixa' }, costHistory: [] },
      },
      {
        // Cobertura alta: 100 disponível / (3 vendidas em 30 dias / 30) = 1000 dias.
        variantId: 'v-high-coverage',
        onHand: 100,
        reserved: 0,
        variant: { sku: 'SKU-C', minStock: 0, product: { name: 'Cobertura alta' }, costHistory: [] },
      },
      {
        // Sem venda nos últimos 30 dias e acima do mínimo: sem dados suficientes, não sugere.
        variantId: 'v-no-recent-sales',
        onHand: 20,
        reserved: 0,
        variant: { sku: 'SKU-D', minStock: 0, product: { name: 'Sem dado recente' }, costHistory: [] },
      },
    ];
    const salesSignals: FakeSalesSignal[] = [
      { variantId: 'v-low-coverage', lastSaleAt: daysAgo(1), qty30d: 30 },
      { variantId: 'v-high-coverage', lastSaleAt: daysAgo(1), qty30d: 3 },
    ];
    const service = makeService(makeFakePrisma({ slowMovingDays: 60, restockCoverageDays: 14 }, rows, salesSignals));

    const insights = await service.getInsights('company-1');
    const bySku = new Map(insights.restockSuggestions.map((i) => [i.sku, i]));

    expect(bySku.get('SKU-A')).toMatchObject({ reason: 'below_minimum' });
    expect(bySku.get('SKU-B')).toMatchObject({ reason: 'low_coverage', coverageDays: 10 });
    expect(bySku.has('SKU-C')).toBe(false);
    expect(bySku.has('SKU-D')).toBe(false);
  });
});
