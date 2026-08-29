import type { PrismaService } from '../common/prisma/prisma.service';
import { PERMISSIONS } from '@ecommerce-manager/shared';
import { SearchService } from './search.service';

interface FakeOrder {
  id: string;
  companyId: string;
  externalOrderId: string | null;
  customerName: string | null;
  total: number;
  orderDate: Date;
  channel: { name: string };
}

interface FakeVariant {
  id: string;
  sku: string;
  companyId: string;
  product: { id: string; name: string };
}

interface FakeFiscalDocument {
  id: string;
  companyId: string;
  number: string | null;
  accessKey: string | null;
  type: string;
  orderId: string | null;
  returnId: string | null;
}

function contains(value: string | null, term: string): boolean {
  return value !== null && value.toLowerCase().includes(term.toLowerCase());
}

interface FakeWhere {
  companyId?: string;
  product?: { companyId: string };
  OR?: Array<Record<string, unknown>>;
}

function makeFakePrisma(fixtures: { orders: FakeOrder[]; variants: FakeVariant[]; fiscalDocuments: FakeFiscalDocument[] }): PrismaService {
  return {
    client: {
      order: {
        findMany: async ({ where }: { where: FakeWhere }) => {
          const term = extractTerm(where);
          return fixtures.orders
            .filter((o) => o.companyId === where.companyId)
            .filter((o) => contains(o.externalOrderId, term) || contains(o.customerName, term) || o.id === term)
            .slice(0, 5);
        },
      },
      productVariant: {
        findMany: async ({ where }: { where: FakeWhere }) => {
          const term = extractTerm(where);
          return fixtures.variants
            .filter((v) => v.companyId === where.product?.companyId)
            .filter((v) => contains(v.sku, term) || contains(v.product.name, term))
            .slice(0, 5);
        },
      },
      fiscalDocument: {
        findMany: async ({ where }: { where: FakeWhere }) => {
          const term = extractTerm(where);
          return fixtures.fiscalDocuments
            .filter((d) => d.companyId === where.companyId)
            .filter((d) => contains(d.number, term) || contains(d.accessKey, term))
            .slice(0, 5);
        },
      },
    },
  } as unknown as PrismaService;
}

// A "where" fake extrai o termo do primeiro filtro OR — o suficiente para simular o
// comportamento real do Prisma (contains/insensitive) sem reimplementar o where inteiro.
function extractTerm(where: FakeWhere): string {
  const first = where.OR?.[0];
  if (!first) return '';
  const value = Object.values(first)[0];
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && 'contains' in value) return String((value as { contains: string }).contains);
  return '';
}

const ALL_READ_PERMISSIONS = [PERMISSIONS.ORDER_READ, PERMISSIONS.PRODUCT_READ, PERMISSIONS.FISCAL_READ];

describe('SearchService (Fase 4, seções 37-39)', () => {
  it('isolamento por empresa: nunca retorna resultados de outra empresa (seção 74/79)', async () => {
    const prisma = makeFakePrisma({
      orders: [
        {
          id: 'order-1',
          companyId: 'company-a',
          externalOrderId: 'TT-123456',
          customerName: 'Maria',
          total: 100,
          orderDate: new Date('2026-08-01'),
          channel: { name: 'TikTok' },
        },
        {
          id: 'order-2',
          companyId: 'company-b',
          externalOrderId: 'TT-123457',
          customerName: 'Maria',
          total: 100,
          orderDate: new Date('2026-08-01'),
          channel: { name: 'TikTok' },
        },
      ],
      variants: [],
      fiscalDocuments: [],
    });
    const service = new SearchService(prisma);

    const result = await service.search('company-a', ALL_READ_PERMISSIONS, 'Maria');

    expect(result.orders).toHaveLength(1);
    expect(result.orders[0].id).toBe('order-1');
  });

  it('só busca em uma seção quando o usuário tem a permissão de leitura correspondente', async () => {
    const prisma = makeFakePrisma({
      orders: [
        {
          id: 'order-1',
          companyId: 'company-a',
          externalOrderId: 'TT-999',
          customerName: null,
          total: 50,
          orderDate: new Date(),
          channel: { name: 'TikTok' },
        },
      ],
      variants: [
        { id: 'variant-1', sku: 'VIE-PRE', companyId: 'company-a', product: { id: 'product-1', name: 'Bolsa Viena' } },
      ],
      fiscalDocuments: [
        { id: 'doc-1', companyId: 'company-a', number: 'TT-999', accessKey: null, type: 'SALE_INVOICE', orderId: 'order-1', returnId: null },
      ],
    });
    const service = new SearchService(prisma);

    const withoutFiscalRead = await service.search('company-a', [PERMISSIONS.ORDER_READ, PERMISSIONS.PRODUCT_READ], 'TT-999');
    expect(withoutFiscalRead.orders).toHaveLength(1);
    expect(withoutFiscalRead.fiscalDocuments).toHaveLength(0);

    const onlyProducts = await service.search('company-a', [PERMISSIONS.PRODUCT_READ], 'VIE-PRE');
    expect(onlyProducts.products).toHaveLength(1);
    expect(onlyProducts.orders).toHaveLength(0);
    expect(onlyProducts.fiscalDocuments).toHaveLength(0);
  });

  it('busca por pedido interno (id), pedido externo, produto, SKU e NF-e', async () => {
    const prisma = makeFakePrisma({
      orders: [
        {
          id: 'order-internal-1',
          companyId: 'company-a',
          externalOrderId: 'TT-555',
          customerName: 'João',
          total: 200,
          orderDate: new Date(),
          channel: { name: 'TikTok' },
        },
      ],
      variants: [
        { id: 'variant-1', sku: 'SKU-ABC', companyId: 'company-a', product: { id: 'product-1', name: 'Camiseta' } },
      ],
      fiscalDocuments: [
        { id: 'doc-1', companyId: 'company-a', number: '125', accessKey: '4252...', type: 'SALE_INVOICE', orderId: 'order-internal-1', returnId: null },
      ],
    });
    const service = new SearchService(prisma);

    const byExternalOrderId = await service.search('company-a', ALL_READ_PERMISSIONS, 'TT-555');
    expect(byExternalOrderId.orders).toHaveLength(1);

    const byInternalId = await service.search('company-a', ALL_READ_PERMISSIONS, 'order-internal-1');
    expect(byInternalId.orders).toHaveLength(1);

    const bySku = await service.search('company-a', ALL_READ_PERMISSIONS, 'SKU-ABC');
    expect(bySku.products).toHaveLength(1);

    const byNfeNumber = await service.search('company-a', ALL_READ_PERMISSIONS, '125');
    expect(byNfeNumber.fiscalDocuments).toHaveLength(1);
  });
});
