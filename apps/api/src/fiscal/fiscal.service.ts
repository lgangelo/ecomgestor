import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@ecommerce-manager/database';
import { PrismaService } from '../common/prisma/prisma.service';
import { paginate } from '../common/dto/pagination.dto';
import { ListFiscalDocumentsQueryDto } from './dto/list-fiscal-documents-query.dto';
import { buildMockFiscalXml } from './fiscal-xml.util';

@Injectable()
export class FiscalService {
  constructor(private readonly prisma: PrismaService) {}

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
              ...(query.dateTo ? { lte: new Date(query.dateTo) } : {}),
            },
          }
        : {}),
    };

    const [documents, total] = await Promise.all([
      this.prisma.client.fiscalDocument.findMany({
        where,
        include: { order: { include: { channel: { select: { name: true } } } } },
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.client.fiscalDocument.count({ where }),
    ]);

    const items = documents.map((doc) => ({
      id: doc.id,
      orderId: doc.orderId,
      customerName: doc.order?.customerName ?? null,
      channelName: doc.order?.channel?.name ?? null,
      type: doc.type,
      number: doc.number,
      series: doc.series,
      status: doc.status,
      issueDate: doc.issueDate,
    }));

    return paginate(items, total, query.page, query.pageSize);
  }

  async findOne(id: string, companyId: string) {
    const doc = await this.prisma.client.fiscalDocument.findFirst({
      where: { id, companyId },
      include: {
        order: {
          include: { channel: { select: { name: true } } },
        },
      },
    });
    if (!doc) throw new NotFoundException('Documento fiscal não encontrado');
    return doc;
  }

  async findManyByIds(ids: string[], companyId: string) {
    const docs = await this.prisma.client.fiscalDocument.findMany({
      where: { id: { in: ids }, companyId },
      include: { order: { select: { id: true, customerName: true, total: true } } },
    });
    if (docs.length !== ids.length) {
      throw new NotFoundException('Um ou mais documentos fiscais não foram encontrados');
    }
    return docs;
  }

  buildXml(doc: {
    id: string;
    number: string | null;
    series: string | null;
    accessKey: string | null;
    type: string;
    status: string;
    issueDate: Date | null;
    orderId: string | null;
    order?: { customerName?: string | null; total?: Prisma.Decimal | null } | null;
  }): string {
    return buildMockFiscalXml({
      documentId: doc.id,
      number: doc.number,
      series: doc.series,
      accessKey: doc.accessKey,
      type: doc.type,
      status: doc.status,
      issueDate: doc.issueDate,
      orderId: doc.orderId,
      customerName: doc.order?.customerName ?? null,
      total: doc.order?.total ? doc.order.total.toString() : null,
    });
  }
}
