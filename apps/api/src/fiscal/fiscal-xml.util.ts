/**
 * Gera um XML fictício (mock) no formato próximo ao de um nfeProc, usado apenas como
 * fixture de teste nesta etapa — não há integração fiscal real (SEFAZ) implementada ainda.
 */
export interface MockXmlInput {
  documentId: string;
  number: string | null;
  series: string | null;
  accessKey: string | null;
  type: string;
  status: string;
  issueDate: Date | null;
  orderId: string | null;
  customerName: string | null;
  total: string | null;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function buildMockFiscalXml(input: MockXmlInput): string {
  const issueDate = input.issueDate ? input.issueDate.toISOString() : '';
  const number = input.number ?? '';
  const series = input.series ?? '';
  const accessKey = input.accessKey ?? '';
  const orderId = input.orderId ?? '';
  const customerName = input.customerName ?? '';
  const total = input.total ?? '0.00';

  return `<?xml version="1.0" encoding="UTF-8"?>
<nfeProc versao="4.00" xmlns="http://www.portalfiscal.inf.br/nfe">
  <NFe>
    <infNFe Id="MOCK${escapeXml(input.documentId)}">
      <ide>
        <nNF>${escapeXml(number)}</nNF>
        <serie>${escapeXml(series)}</serie>
        <tpDoc>${escapeXml(input.type)}</tpDoc>
        <dhEmi>${escapeXml(issueDate)}</dhEmi>
      </ide>
      <dest>
        <xNome>${escapeXml(customerName)}</xNome>
      </dest>
      <pedido>
        <idPedido>${escapeXml(orderId)}</idPedido>
      </pedido>
      <total>
        <ICMSTot>
          <vNF>${escapeXml(total)}</vNF>
        </ICMSTot>
      </total>
      <chNFe>${escapeXml(accessKey)}</chNFe>
      <statusDocumento>${escapeXml(input.status)}</statusDocumento>
    </infNFe>
    <protNFe>
      <infProt>
        <chNFe>${escapeXml(accessKey)}</chNFe>
        <xMotivo>Documento fictício gerado para fins de teste — integração fiscal real ainda não implementada nesta etapa.</xMotivo>
      </infProt>
    </protNFe>
  </NFe>
</nfeProc>
`;
}
