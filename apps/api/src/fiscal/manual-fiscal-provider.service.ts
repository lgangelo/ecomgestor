import { Injectable } from '@nestjs/common';
import { readFile } from 'node:fs/promises';
import { FiscalDocumentProvider, FiscalDocumentReference } from './fiscal-document-provider.interface';

/**
 * Único provider real hoje (seção 6/18 da Fase 4): lê o XML do disco quando o documento foi
 * enviado manualmente em modo PERSIST (`XML_STORAGE_MODE=PERSIST`, legado — ver
 * fiscal.service.ts). Em modo REFERENCE_ONLY (default) nenhum documento tem `xmlPath`, então
 * este provider nunca `supports` nada e o documento aparece corretamente como indisponível.
 */
@Injectable()
export class ManualFiscalProvider implements FiscalDocumentProvider {
  readonly name = 'manual';

  supports(doc: FiscalDocumentReference): boolean {
    return doc.sourceType === 'UPLOADED' && Boolean(doc.xmlPath);
  }

  async downloadXml(doc: FiscalDocumentReference): Promise<Buffer> {
    if (!doc.xmlPath) {
      throw new Error('ManualFiscalProvider chamado sem xmlPath — supports() deveria ter barrado isso');
    }
    return readFile(doc.xmlPath);
  }
}
