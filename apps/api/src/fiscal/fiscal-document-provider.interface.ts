/**
 * Contrato de origem de XML fiscal (seção 6 da Fase 4). O domínio não deve depender de onde o
 * XML realmente mora — hoje só existe `ManualFiscalProvider` (upload manual, modo legado
 * PERSIST). `MarketplaceFiscalProvider`/`ExternalIssuerFiscalProvider` só devem ser
 * implementados quando houver uma fonte oficial/documentada real (a pesquisa da Fase 3 já
 * confirmou que não existe hoje para TikTok Shop — ver docs/integrations/tiktok.md).
 */
export interface FiscalDocumentReference {
  id: string;
  type: string;
  number: string | null;
  series: string | null;
  accessKey: string | null;
  issueDate: Date | null;
  orderId: string | null;
  returnId: string | null;
  sourceType: string;
  /** Só relevante para o provider legado — nunca deveria ser lido fora dele. */
  xmlPath: string | null;
}

export interface FiscalDocumentProvider {
  readonly name: string;
  /** Decide, sem I/O, se este provider sabe lidar com o documento. */
  supports(doc: FiscalDocumentReference): boolean;
  /** Só chamado quando `supports` retornou true. Pode lançar — o chamador trata como indisponível. */
  downloadXml(doc: FiscalDocumentReference): Promise<Buffer>;
}
