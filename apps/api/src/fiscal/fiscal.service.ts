import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Prisma } from '@ecommerce-manager/database';
import { PrismaService } from '../common/prisma/prisma.service';
import { paginate } from '../common/dto/pagination.dto';
import { getMonthRangeFromReference } from '../common/date/month-range.util';
import { endOfDayExclusive } from '../common/date/day-range.util';
import { ListFiscalDocumentsQueryDto } from './dto/list-fiscal-documents-query.dto';
import { UploadFiscalDocumentDto } from './dto/upload-fiscal-document.dto';
import { AssociateFiscalDocumentDto } from './dto/associate-fiscal-document.dto';
import { extractFiscalData, sha256Hex } from './xml-extraction.util';
import { FiscalDocumentProvider, FiscalDocumentReference } from './fiscal-document-provider.interface';
import { ManualFiscalProvider } from './manual-fiscal-provider.service';

const MAX_XML_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB
const ALLOWED_MIME_TYPES = ['application/xml', 'text/xml'];

export interface UploadedFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

export interface FiscalExportRow {
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
  channelName: string | null;
  amount: string | null;
  /** Referência de pedido exibida no manifest — para NF-e de devolução, é o pedido pai. */
  orderRef: string;
}

@Injectable()
export class FiscalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly manualProvider: ManualFiscalProvider,
  ) {}

  /**
   * Providers registrados, em ordem de tentativa (seção 6 da Fase 4). Hoje só existe o manual —
   * novos providers reais (marketplace, emissor externo) entram aqui quando existirem, nunca
   * antes de haver fonte oficial/documentada (seção 6/7).
   */
  private get providers(): FiscalDocumentProvider[] {
    return [this.manualProvider];
  }

  private isPersistMode(): boolean {
    return this.config.get<string>('xmlStorageMode') === 'PERSIST';
  }

  async findAll(companyId: string, query: ListFiscalDocumentsQueryDto) {
    const where: Prisma.FiscalDocumentWhereInput = {
      companyId,
      ...(query.orderId ? { orderId: query.orderId } : {}),
      ...(query.type ? { type: query.type } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.dateFrom || query.dateTo
        ? {
            issueDate: {
              ...(query.dateFrom ? { gte: new Date(query.dateFrom) } : {}),
              ...(query.dateTo ? { lt: endOfDayExclusive(query.dateTo) } : {}),
            },
          }
        : {}),
    };

    const [documents, total] = await Promise.all([
      this.prisma.client.fiscalDocument.findMany({
        where,
        include: {
          order: { include: { channel: { select: { name: true } } } },
          return: { include: { order: { select: { id: true, channel: { select: { name: true } } } } } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.client.fiscalDocument.count({ where }),
    ]);

    const items = documents.map((doc) => ({
      id: doc.id,
      orderId: doc.orderId ?? doc.return?.orderId ?? null,
      returnId: doc.returnId,
      customerName: doc.order?.customerName ?? null,
      channelName: doc.order?.channel?.name ?? doc.return?.order.channel?.name ?? null,
      type: doc.type,
      number: doc.number,
      series: doc.series,
      status: doc.status,
      sourceType: doc.sourceType,
      xmlAvailable: doc.xmlAvailable,
      issueDate: doc.issueDate,
    }));

    return paginate(items, total, query.page, query.pageSize);
  }

  async findOne(id: string, companyId: string) {
    const doc = await this.prisma.client.fiscalDocument.findFirst({
      where: { id, companyId },
      include: {
        order: { include: { channel: { select: { name: true } } } },
        return: { include: { order: { select: { id: true, customerName: true, channel: { select: { name: true } } } } } },
      },
    });
    if (!doc) throw new NotFoundException('Documento fiscal não encontrado');
    return doc;
  }

  async findManyByIds(ids: string[], companyId: string): Promise<FiscalExportRow[]> {
    const docs = await this.prisma.client.fiscalDocument.findMany({
      where: { id: { in: ids }, companyId },
      include: {
        order: { select: { id: true, total: true, channel: { select: { name: true } } } },
        return: {
          include: {
            order: { select: { id: true, channel: { select: { name: true } } } },
            refunds: { select: { amount: true } },
          },
        },
      },
    });
    if (docs.length !== ids.length) {
      throw new NotFoundException('Um ou mais documentos fiscais não foram encontrados');
    }
    return docs.map(toExportRow);
  }

  /**
   * Preview antes do download (seção 12 da Fase 4) — nunca finge que o pacote está completo:
   * mostra exatamente quantos documentos existem no mês e quantos têm XML disponível.
   */
  async getMonthlySummary(companyId: string, referenceMonth: string, channelId?: string) {
    const { start, end } = getMonthRangeFromReference(referenceMonth);
    const docs = await this.prisma.client.fiscalDocument.findMany({
      where: this.buildMonthlyWhere(companyId, start, end, channelId),
      select: { type: true, xmlAvailable: true },
    });

    const saleInvoiceCount = docs.filter((d) => d.type === 'SALE_INVOICE').length;
    const returnInvoiceCount = docs.filter((d) => d.type === 'RETURN_INVOICE').length;
    const xmlAvailableCount = docs.filter((d) => d.xmlAvailable).length;

    return {
      referenceMonth,
      documentsCount: docs.length,
      saleInvoiceCount,
      returnInvoiceCount,
      xmlAvailableCount,
      xmlUnavailableCount: docs.length - xmlAvailableCount,
    };
  }

  /** Documentos do mês, já no formato de exportação (seção 9/13 da Fase 4). */
  async getDocumentsForMonth(companyId: string, referenceMonth: string, channelId?: string): Promise<FiscalExportRow[]> {
    const { start, end } = getMonthRangeFromReference(referenceMonth);
    const docs = await this.prisma.client.fiscalDocument.findMany({
      where: this.buildMonthlyWhere(companyId, start, end, channelId),
      include: {
        order: { select: { id: true, total: true, channel: { select: { name: true } } } },
        return: {
          include: {
            order: { select: { id: true, channel: { select: { name: true } } } },
            refunds: { select: { amount: true } },
          },
        },
      },
      orderBy: { issueDate: 'asc' },
    });
    return docs.map(toExportRow);
  }

  private buildMonthlyWhere(companyId: string, start: Date, end: Date, channelId?: string): Prisma.FiscalDocumentWhereInput {
    return {
      companyId,
      // Regra temporal (seção 5 da Fase 4): SEMPRE issueDate, nunca a data do pedido.
      issueDate: { gte: start, lt: end },
      ...(channelId
        ? { OR: [{ order: { channelId } }, { return: { order: { channelId } } }] }
        : {}),
    };
  }

  /** Tenta obter o XML real via os providers registrados — nunca inventa/mocka nesta função. */
  async tryDownloadXml(doc: FiscalDocumentReference): Promise<Buffer | null> {
    for (const provider of this.providers) {
      if (provider.supports(doc)) {
        try {
          return await provider.downloadXml(doc);
        } catch {
          return null;
        }
      }
    }
    return null;
  }

  /** Motivo amigável para pendencias.csv (seção 15) — nunca um genérico "erro". */
  reasonUnavailable(doc: FiscalExportRow): string {
    if (doc.sourceType === 'GENERATED') {
      return 'Documento sem XML real associado (gerado internamente, sem upload)';
    }
    if (!doc.xmlPath) {
      return 'XML não foi mantido em armazenamento (modo somente referência)';
    }
    return 'Arquivo XML não encontrado na origem configurada';
  }

  /**
   * Upload real de XML (seções 18-19 da Fase 4). Em modo REFERENCE_ONLY (default) o conteúdo do
   * arquivo NUNCA é escrito em disco — só a referência fiscal extraída é persistida; o hash
   * ainda é calculado e checado para bloquear reenvio duplicado, sem precisar guardar o
   * arquivo. Em modo PERSIST (legado) o comportamento é o mesmo da Fase 2.
   */
  async uploadDocument(companyId: string, userId: string, file: UploadedFile, dto: UploadFiscalDocumentDto) {
    if (!file) throw new BadRequestException('Nenhum arquivo enviado');
    if (file.size > MAX_XML_SIZE_BYTES) {
      throw new BadRequestException(`Arquivo excede o tamanho máximo de ${MAX_XML_SIZE_BYTES / 1024 / 1024}MB`);
    }
    const isXmlExtension = /\.xml$/i.test(file.originalname);
    const isXmlMime = ALLOWED_MIME_TYPES.includes(file.mimetype);
    if (!isXmlExtension && !isXmlMime) {
      throw new BadRequestException('Apenas arquivos XML são aceitos');
    }

    const content = file.buffer.toString('utf-8');
    if (!content.trimStart().startsWith('<')) {
      throw new BadRequestException('O conteúdo do arquivo não parece ser um XML válido');
    }

    const xmlSha256 = sha256Hex(file.buffer);
    const duplicate = await this.prisma.client.fiscalDocument.findUnique({
      where: { companyId_xmlSha256: { companyId, xmlSha256 } },
    });
    if (duplicate) {
      throw new BadRequestException('Este XML já foi enviado anteriormente (documento duplicado)');
    }

    const extracted = extractFiscalData(content);

    let orderId = dto.orderId ?? null;
    if (!orderId && !dto.returnId && extracted.totalValue) {
      orderId = await this.tryAutoAssociate(companyId, extracted);
    }
    if (orderId) {
      const order = await this.prisma.client.order.findFirst({ where: { id: orderId, companyId } });
      if (!order) throw new BadRequestException('Pedido informado não encontrado nesta empresa');
    }
    if (dto.returnId) {
      const ret = await this.prisma.client.return.findFirst({ where: { id: dto.returnId, order: { companyId } } });
      if (!ret) throw new BadRequestException('Devolução informada não encontrada nesta empresa');
    }

    const persistMode = this.isPersistMode();
    let xmlPath: string | null = null;
    if (persistMode) {
      const dir = join(this.config.get<string>('fiscalXmlStorageDir')!, companyId);
      await mkdir(dir, { recursive: true });
      xmlPath = join(dir, `${xmlSha256}.xml`);
      await writeFile(xmlPath, file.buffer);
    }

    const document = await this.prisma.client.fiscalDocument.create({
      data: {
        companyId,
        orderId,
        returnId: dto.returnId ?? null,
        type: dto.type,
        number: extracted.number,
        series: extracted.series,
        accessKey: extracted.accessKey,
        issueDate: extracted.issueDate ? new Date(extracted.issueDate) : null,
        status: 'ISSUED',
        sourceType: 'UPLOADED',
        xmlPath,
        xmlSha256,
        xmlOriginalFilename: persistMode ? file.originalname : null,
        extractedData: persistMode ? (extracted as unknown as Prisma.InputJsonValue) : undefined,
        xmlAvailable: persistMode,
        lastXmlCheckAt: new Date(),
      },
    });

    return { document, autoAssociated: Boolean(orderId && !dto.orderId), userId };
  }

  async associate(id: string, companyId: string, dto: AssociateFiscalDocumentDto) {
    const doc = await this.prisma.client.fiscalDocument.findFirst({ where: { id, companyId } });
    if (!doc) throw new NotFoundException('Documento fiscal não encontrado');

    if (dto.orderId) {
      const order = await this.prisma.client.order.findFirst({ where: { id: dto.orderId, companyId } });
      if (!order) throw new BadRequestException('Pedido não encontrado nesta empresa');
      return this.prisma.client.fiscalDocument.update({ where: { id }, data: { orderId: dto.orderId, returnId: null } });
    }

    const ret = await this.prisma.client.return.findFirst({ where: { id: dto.returnId, order: { companyId } } });
    if (!ret) throw new BadRequestException('Devolução não encontrada nesta empresa');
    return this.prisma.client.fiscalDocument.update({ where: { id }, data: { returnId: dto.returnId, orderId: null } });
  }

  /** Pendências fiscais visíveis e navegáveis (independente de mês). */
  async getPending(companyId: string) {
    const [salesWithoutInvoice, returnsWithoutDocument] = await Promise.all([
      this.prisma.client.order.findMany({
        where: { companyId, status: { not: 'CANCELLED' }, fiscalDocuments: { none: {} } },
        select: { id: true, orderDate: true, customerName: true, total: true, channel: { select: { name: true } } },
        orderBy: { orderDate: 'desc' },
        take: 50,
      }),
      this.prisma.client.return.findMany({
        where: { order: { companyId }, fiscalDocuments: { none: {} } },
        include: { order: { select: { id: true, customerName: true } } },
        take: 50,
      }),
    ]);

    return {
      salesWithoutInvoice: salesWithoutInvoice.map((o) => ({
        orderId: o.id,
        orderDate: o.orderDate,
        customerName: o.customerName,
        channelName: o.channel.name,
        total: o.total,
      })),
      returnsWithoutDocument: returnsWithoutDocument.map((ret) => ({
        id: ret.id,
        orderId: ret.orderId,
        customerName: ret.order.customerName,
      })),
    };
  }

  private async tryAutoAssociate(
    companyId: string,
    extracted: { totalValue: string | null; issueDate: string | null },
  ): Promise<string | null> {
    if (!extracted.totalValue) return null;
    const value = Number(extracted.totalValue);
    if (Number.isNaN(value)) return null;

    const dateRef = extracted.issueDate ? new Date(extracted.issueDate) : null;
    const dayStart = dateRef ? new Date(Date.UTC(dateRef.getUTCFullYear(), dateRef.getUTCMonth(), dateRef.getUTCDate())) : undefined;
    const dayEnd = dayStart ? new Date(dayStart.getTime() + 24 * 60 * 60 * 1000) : undefined;

    const candidates = await this.prisma.client.order.findMany({
      where: {
        companyId,
        total: { gte: value - 0.01, lte: value + 0.01 },
        ...(dayStart && dayEnd ? { orderDate: { gte: dayStart, lt: dayEnd } } : {}),
        fiscalDocuments: { none: {} },
      },
      select: { id: true },
      take: 2,
    });

    return candidates.length === 1 ? candidates[0].id : null;
  }
}

interface RawFiscalDocForExport {
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
  order: { id: string; total?: Prisma.Decimal; channel: { name: string } } | null;
  return:
    | {
        orderId: string;
        order: { id: string; channel: { name: string } };
        refunds: { amount: Prisma.Decimal }[];
      }
    | null;
}

function toExportRow(doc: RawFiscalDocForExport): FiscalExportRow {
  const isReturn = Boolean(doc.return);
  const channelName = doc.order?.channel.name ?? doc.return?.order.channel.name ?? null;
  const orderRef = doc.orderId ?? doc.return?.orderId ?? doc.returnId ?? '';
  const amount = doc.order?.total
    ? doc.order.total.toString()
    : isReturn && doc.return
      ? doc.return.refunds.reduce((sum, r) => sum + Number(r.amount), 0).toFixed(2)
      : null;

  return {
    id: doc.id,
    type: doc.type,
    number: doc.number,
    series: doc.series,
    accessKey: doc.accessKey,
    issueDate: doc.issueDate,
    orderId: doc.orderId,
    returnId: doc.returnId,
    sourceType: doc.sourceType,
    xmlPath: doc.xmlPath,
    channelName,
    amount,
    orderRef,
  };
}
