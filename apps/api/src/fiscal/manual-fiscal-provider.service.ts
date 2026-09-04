import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { readFile } from 'node:fs/promises';
import { R2StorageService } from '../common/storage/r2-storage.service';
import { FiscalDocumentProvider, FiscalDocumentReference } from './fiscal-document-provider.interface';

/** Prefixo que marca `xmlPath` como uma CHAVE do bucket R2 privado, nunca um path de disco — sem
 * isso não dá pra distinguir os dois formatos numa instalação em transição (documentos antigos
 * continuam com um path de disco de verdade, novos já vêm com este prefixo). */
export const R2_XML_KEY_PREFIX = 'r2://';

/**
 * Único provider real hoje (seção 6/18 da Fase 4): lê o XML de onde ele foi persistido quando o
 * documento foi enviado manualmente em modo PERSIST (`XML_STORAGE_MODE=PERSIST`) — do bucket R2
 * privado (`R2_FISCAL_BUCKET`, nunca um link público, só a API S3 autenticada) quando o
 * `xmlPath` começa com `r2://`, ou do disco local (legado, ou instalação sem R2 configurado)
 * caso contrário. Em modo REFERENCE_ONLY (default) nenhum documento tem `xmlPath`, então este
 * provider nunca `supports` nada e o documento aparece corretamente como indisponível.
 */
@Injectable()
export class ManualFiscalProvider implements FiscalDocumentProvider {
  readonly name = 'manual';

  constructor(
    private readonly config: ConfigService,
    private readonly r2: R2StorageService,
  ) {}

  supports(doc: FiscalDocumentReference): boolean {
    return doc.sourceType === 'UPLOADED' && Boolean(doc.xmlPath);
  }

  async downloadXml(doc: FiscalDocumentReference): Promise<Buffer> {
    if (!doc.xmlPath) {
      throw new Error('ManualFiscalProvider chamado sem xmlPath — supports() deveria ter barrado isso');
    }
    if (doc.xmlPath.startsWith(R2_XML_KEY_PREFIX)) {
      const fiscalBucket = this.config.get<{ fiscalBucket: string }>('r2')!.fiscalBucket;
      const key = doc.xmlPath.slice(R2_XML_KEY_PREFIX.length);
      return this.r2.getObject(fiscalBucket, key);
    }
    return readFile(doc.xmlPath);
  }
}
