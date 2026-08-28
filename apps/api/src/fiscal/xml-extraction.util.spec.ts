import { extractFiscalData, sha256Hex } from './xml-extraction.util';

const SAMPLE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<nfeProc versao="4.00" xmlns="http://www.portalfiscal.inf.br/nfe">
  <NFe>
    <infNFe Id="NFe35260812345678000199550010000012341123456789">
      <ide>
        <nNF>1234</nNF>
        <serie>1</serie>
        <dhEmi>2026-08-20T10:00:00-03:00</dhEmi>
      </ide>
      <emit>
        <CNPJ>12345678000199</CNPJ>
      </emit>
      <dest>
        <CPF>98765432100</CPF>
      </dest>
      <total>
        <ICMSTot>
          <vNF>129.90</vNF>
        </ICMSTot>
      </total>
      <chNFe>35260812345678000199550010000012341123456789</chNFe>
    </infNFe>
  </NFe>
</nfeProc>`;

describe('extractFiscalData', () => {
  it('extracts the known NF-e fields from a well-formed XML', () => {
    const result = extractFiscalData(SAMPLE_XML);
    expect(result.accessKey).toBe('35260812345678000199550010000012341123456789');
    expect(result.number).toBe('1234');
    expect(result.series).toBe('1');
    expect(result.issueDate).toBe('2026-08-20T10:00:00-03:00');
    expect(result.emitterCnpj).toBe('12345678000199');
    expect(result.recipientDocument).toBe('98765432100');
    expect(result.totalValue).toBe('129.90');
  });

  it('never throws and returns nulls for missing fields instead', () => {
    const result = extractFiscalData('<xml>not a real NFe</xml>');
    expect(result.accessKey).toBeNull();
    expect(result.number).toBeNull();
    expect(result.totalValue).toBeNull();
  });
});

describe('sha256Hex', () => {
  it('produces a stable hash for identical content (used to detect duplicate uploads)', () => {
    const a = sha256Hex('conteudo-do-xml');
    const b = sha256Hex('conteudo-do-xml');
    expect(a).toBe(b);
    expect(a).toHaveLength(64);
  });

  it('produces different hashes for different content', () => {
    expect(sha256Hex('a')).not.toBe(sha256Hex('b'));
  });
});
