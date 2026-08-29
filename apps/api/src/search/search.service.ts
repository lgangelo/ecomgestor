import { Injectable } from '@nestjs/common';
import { PERMISSIONS, type PermissionKey } from '@ecommerce-manager/shared';
import { PrismaService } from '../common/prisma/prisma.service';

const SEARCH_LIMIT = 5;

export interface SearchOrderResult {
  id: string;
  externalOrderId: string | null;
  customerName: string | null;
  channelName: string;
  total: string;
  orderDate: string;
}

export interface SearchProductResult {
  productId: string;
  productName: string;
  variantId: string;
  sku: string;
}

export interface SearchFiscalDocumentResult {
  id: string;
  number: string | null;
  type: string;
  orderId: string | null;
  returnId: string | null;
}

export interface SearchResult {
  orders: SearchOrderResult[];
  products: SearchProductResult[];
  fiscalDocuments: SearchFiscalDocumentResult[];
}

/**
 * Busca global (seção 37-39 da Fase 4): pedido interno/externo, produto, SKU, cliente, NF-e e
 * chave de acesso — só usando os índices/consultas simples do PostgreSQL já existentes, sem
 * introduzir Elasticsearch (seção 39). Cada seção só é buscada quando o usuário tem a permissão
 * de leitura correspondente — a busca nunca revela a existência de dados que o usuário não pode
 * ver em suas próprias telas.
 */
@Injectable()
export class SearchService {
  constructor(private readonly prisma: PrismaService) {}

  async search(companyId: string, permissions: string[], q: string): Promise<SearchResult> {
    const has = (permission: PermissionKey) => permissions.includes(permission);
    const term = q.trim();

    const [orders, products, fiscalDocuments] = await Promise.all([
      has(PERMISSIONS.ORDER_READ) ? this.searchOrders(companyId, term) : Promise.resolve([]),
      has(PERMISSIONS.PRODUCT_READ) ? this.searchProducts(companyId, term) : Promise.resolve([]),
      has(PERMISSIONS.FISCAL_READ) ? this.searchFiscalDocuments(companyId, term) : Promise.resolve([]),
    ]);

    return { orders, products, fiscalDocuments };
  }

  private async searchOrders(companyId: string, term: string): Promise<SearchOrderResult[]> {
    const orders = await this.prisma.client.order.findMany({
      where: {
        companyId,
        OR: [
          { externalOrderId: { contains: term, mode: 'insensitive' } },
          { customerName: { contains: term, mode: 'insensitive' } },
          { id: term },
        ],
      },
      select: {
        id: true,
        externalOrderId: true,
        customerName: true,
        total: true,
        orderDate: true,
        channel: { select: { name: true } },
      },
      orderBy: { orderDate: 'desc' },
      take: SEARCH_LIMIT,
    });

    return orders.map((o) => ({
      id: o.id,
      externalOrderId: o.externalOrderId,
      customerName: o.customerName,
      channelName: o.channel.name,
      total: o.total.toString(),
      orderDate: o.orderDate.toISOString(),
    }));
  }

  private async searchProducts(companyId: string, term: string): Promise<SearchProductResult[]> {
    const variants = await this.prisma.client.productVariant.findMany({
      where: {
        product: { companyId },
        OR: [
          { sku: { contains: term, mode: 'insensitive' } },
          { product: { name: { contains: term, mode: 'insensitive' } } },
        ],
      },
      select: { id: true, sku: true, product: { select: { id: true, name: true } } },
      take: SEARCH_LIMIT,
    });

    return variants.map((v) => ({
      productId: v.product.id,
      productName: v.product.name,
      variantId: v.id,
      sku: v.sku,
    }));
  }

  private async searchFiscalDocuments(companyId: string, term: string): Promise<SearchFiscalDocumentResult[]> {
    const docs = await this.prisma.client.fiscalDocument.findMany({
      where: {
        companyId,
        OR: [
          { number: { contains: term, mode: 'insensitive' } },
          { accessKey: { contains: term, mode: 'insensitive' } },
        ],
      },
      select: { id: true, number: true, type: true, orderId: true, returnId: true },
      take: SEARCH_LIMIT,
    });

    return docs;
  }
}
