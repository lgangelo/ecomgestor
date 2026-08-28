import { createHash } from 'node:crypto';

export interface ExtractedFiscalData {
  accessKey: string | null;
  number: string | null;
  series: string | null;
  issueDate: string | null;
  emitterCnpj: string | null;
  recipientDocument: string | null;
  totalValue: string | null;
}

function extractTag(xml: string, tag: string): string | null {
  const match = new RegExp(`<${tag}>([^<]*)</${tag}>`, 'i').exec(xml);
  return match ? match[1].trim() : null;
}

/**
 * Extração básica (seção 32) de campos comuns de um XML de NF-e — via regex sobre tags
 * conhecidas, não um parser XML/XSD completo. Nunca lança erro se algum campo não existir:
 * o XML original é sempre preservado como veio, independentemente do que foi extraído daqui.
 * Não realiza NENHUMA validação fiscal junto à SEFAZ.
 *
 * Segurança (seção 73 da Fase 4): por ser regex sobre string, nunca resolve DTD nem entidades
 * externas (XXE exige um parser XML de verdade processando `<!ENTITY>`/`<!DOCTYPE>`, o que este
 * código nunca faz) — a superfície de ataque XXE simplesmente não existe aqui. O limite de
 * tamanho (5 MB) é aplicado antes desta função ser chamada, em `fiscal.service.ts::uploadDocument`.
 */
export function extractFiscalData(xmlContent: string): ExtractedFiscalData {
  const accessKeyMatch = /Id="(?:NFe)?(\d{44})"/i.exec(xmlContent) ?? /<chNFe>(\d{44})<\/chNFe>/i.exec(xmlContent);

  return {
    accessKey: accessKeyMatch ? accessKeyMatch[1] : null,
    number: extractTag(xmlContent, 'nNF'),
    series: extractTag(xmlContent, 'serie'),
    issueDate: extractTag(xmlContent, 'dhEmi') ?? extractTag(xmlContent, 'dEmi'),
    emitterCnpj: (() => {
      const emitMatch = /<emit>[\s\S]*?<CNPJ>([^<]*)<\/CNPJ>[\s\S]*?<\/emit>/i.exec(xmlContent);
      return emitMatch ? emitMatch[1].trim() : null;
    })(),
    recipientDocument: (() => {
      const destMatch = /<dest>[\s\S]*?<(?:CNPJ|CPF)>([^<]*)<\/(?:CNPJ|CPF)>[\s\S]*?<\/dest>/i.exec(xmlContent);
      return destMatch ? destMatch[1].trim() : null;
    })(),
    totalValue: (() => {
      const totalMatch = /<ICMSTot>[\s\S]*?<vNF>([^<]*)<\/vNF>[\s\S]*?<\/ICMSTot>/i.exec(xmlContent);
      return totalMatch ? totalMatch[1].trim() : extractTag(xmlContent, 'vNF');
    })(),
  };
}

export function sha256Hex(content: Buffer | string): string {
  return createHash('sha256').update(content).digest('hex');
}
