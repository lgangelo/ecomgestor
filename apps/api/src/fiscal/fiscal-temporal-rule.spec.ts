import type { PrismaService } from '../common/prisma/prisma.service';
import type { ConfigService } from '@nestjs/config';
import { FiscalService } from './fiscal.service';
import { ManualFiscalProvider } from './manual-fiscal-provider.service';

/**
 * Regra temporal da Fase 4 (seção 5): o fechamento/exportação fiscal por mês usa SEMPRE
 * `issueDate`, nunca a data do pedido. Este fake reproduz esse comportamento em memória
 * filtrando por `where.issueDate` — se `fiscal.service.ts` algum dia voltar a filtrar por
 * `orderDate`, estes testes devem falhar (a Fase 2 tinha exatamente esse bug).
 */
interface FakeDoc {
  id: string;
  type: string;
  number: string | null;
  series: string | null;
  accessKey: string | null;
  issueDate: Date | null;
  orderId: string | null;
  returnId: string | null;
  sourceType: string;
  xmlPath: string | null;
  xmlAvailable: boolean;
  channelId: string;
}

function makeFakePrisma(docs: FakeDoc[]) {
  const findMany = async ({ where, select }: { where: { issueDate?: { gte: Date; lt: Date }; OR?: unknown[] }; select?: unknown }) => {
    void select;
    return docs.filter((d) => {
      if (!d.issueDate) return false;
      if (where.issueDate && (d.issueDate < where.issueDate.gte || d.issueDate >= where.issueDate.lt)) return false;
      return true;
    });
  };

  return { client: { fiscalDocument: { findMany } } } as unknown as PrismaService;
}

function makeConfig(): ConfigService {
  return { get: () => 'REFERENCE_ONLY' } as unknown as ConfigService;
}

describe('FiscalService — regra temporal (seção 5 da Fase 4)', () => {
  it('pedido de julho com NF-e emitida em agosto pertence ao fechamento de AGOSTO, não julho', async () => {
    // Pedido criado/vendido em julho, mas a nota só foi emitida em 01/08 — o pedido "aconteceu"
    // em julho só no sentido comercial; a NF-e em si é um documento de agosto.
    const docs: FakeDoc[] = [
      {
        id: 'doc-1',
        type: 'SALE_INVOICE',
        number: '100',
        series: '1',
        accessKey: null,
        issueDate: new Date('2026-08-01T10:00:00Z'),
        orderId: 'order-july',
        returnId: null,
        sourceType: 'GENERATED',
        xmlPath: null,
        xmlAvailable: false,
        channelId: 'channel-1',
      },
    ];
    const service = new FiscalService(makeFakePrisma(docs), makeConfig(), new ManualFiscalProvider());

    const july = await service.getMonthlySummary('company-1', '2026-07');
    const august = await service.getMonthlySummary('company-1', '2026-08');

    expect(july.documentsCount).toBe(0);
    expect(august.documentsCount).toBe(1);
    expect(august.saleInvoiceCount).toBe(1);
  });

  it('venda de julho + devolução de agosto: cada NF-e cai no mês da própria emissão', async () => {
    const docs: FakeDoc[] = [
      {
        id: 'doc-sale',
        type: 'SALE_INVOICE',
        number: '200',
        series: '1',
        accessKey: null,
        issueDate: new Date('2026-07-15T12:00:00Z'),
        orderId: 'order-1',
        returnId: null,
        sourceType: 'GENERATED',
        xmlPath: null,
        xmlAvailable: false,
        channelId: 'channel-1',
      },
      {
        id: 'doc-return',
        type: 'RETURN_INVOICE',
        number: '201',
        series: '1',
        accessKey: null,
        issueDate: new Date('2026-08-08T12:00:00Z'),
        orderId: null,
        returnId: 'return-1',
        sourceType: 'GENERATED',
        xmlPath: null,
        xmlAvailable: false,
        channelId: 'channel-1',
      },
    ];
    const service = new FiscalService(makeFakePrisma(docs), makeConfig(), new ManualFiscalProvider());

    const july = await service.getMonthlySummary('company-1', '2026-07');
    const august = await service.getMonthlySummary('company-1', '2026-08');

    expect(july.saleInvoiceCount).toBe(1);
    expect(july.returnInvoiceCount).toBe(0);
    expect(august.saleInvoiceCount).toBe(0);
    expect(august.returnInvoiceCount).toBe(1);
  });

  it('documento sem issueDate nunca aparece em nenhum fechamento mensal (nunca adivinha o mês)', async () => {
    const docs: FakeDoc[] = [
      {
        id: 'doc-no-date',
        type: 'SALE_INVOICE',
        number: '300',
        series: '1',
        accessKey: null,
        issueDate: null,
        orderId: 'order-2',
        returnId: null,
        sourceType: 'UPLOADED',
        xmlPath: null,
        xmlAvailable: false,
        channelId: 'channel-1',
      },
    ];
    const service = new FiscalService(makeFakePrisma(docs), makeConfig(), new ManualFiscalProvider());

    const august = await service.getMonthlySummary('company-1', '2026-08');
    expect(august.documentsCount).toBe(0);
  });
});
