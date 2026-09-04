import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ConfigService } from '@nestjs/config';
import type { R2StorageService } from '../common/storage/r2-storage.service';
import { ManualFiscalProvider } from './manual-fiscal-provider.service';
import type { FiscalDocumentReference } from './fiscal-document-provider.interface';

function fakeConfig(fiscalBucket: string): ConfigService {
  return { get: (key: string) => (key === 'r2' ? { fiscalBucket } : undefined) } as unknown as ConfigService;
}

function makeDoc(xmlPath: string | null): FiscalDocumentReference {
  return {
    id: 'doc-1',
    type: 'SALE_INVOICE',
    number: '100',
    series: '1',
    accessKey: null,
    issueDate: new Date(),
    orderId: 'order-1',
    returnId: null,
    sourceType: 'UPLOADED',
    xmlPath,
  };
}

describe('ManualFiscalProvider.downloadXml — bucket R2 privado vs. disco local', () => {
  it('lê do bucket R2 quando xmlPath começa com "r2://" (nunca do disco)', async () => {
    const getObject = jest.fn().mockResolvedValue(Buffer.from('<xml>conteudo r2</xml>'));
    const r2 = { getObject } as unknown as R2StorageService;
    const provider = new ManualFiscalProvider(fakeConfig('ecomgestor-fiscal'), r2);

    const buffer = await provider.downloadXml(makeDoc('r2://xml/company-1/abc123.xml'));

    expect(getObject).toHaveBeenCalledWith('ecomgestor-fiscal', 'xml/company-1/abc123.xml');
    expect(buffer.toString()).toBe('<xml>conteudo r2</xml>');
  });

  it('lê do disco local quando xmlPath é um path de verdade (documento anterior à migração pro R2)', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'fiscal-xml-test-'));
    try {
      const xmlPath = join(dir, 'legado.xml');
      await writeFile(xmlPath, '<xml>conteudo legado em disco</xml>');
      const getObject = jest.fn();
      const provider = new ManualFiscalProvider(fakeConfig('ecomgestor-fiscal'), { getObject } as unknown as R2StorageService);

      const buffer = await provider.downloadXml(makeDoc(xmlPath));

      expect(buffer.toString()).toBe('<xml>conteudo legado em disco</xml>');
      expect(getObject).not.toHaveBeenCalled();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('supports() só é true quando o documento foi UPLOADED e tem xmlPath — mesmo critério de sempre', () => {
    const provider = new ManualFiscalProvider(fakeConfig(''), {} as unknown as R2StorageService);

    expect(provider.supports(makeDoc('r2://xml/company-1/abc.xml'))).toBe(true);
    expect(provider.supports(makeDoc(null))).toBe(false);
    expect(provider.supports({ ...makeDoc('r2://x'), sourceType: 'GENERATED' })).toBe(false);
  });
});
