import {
  ExternalInventory,
  ExternalOrderPage,
  ExternalProductPage,
  ExternalReturnPage,
  ExternalStatementPage,
  ExternalTransactionPage,
  IntegrationHealth,
  InventorySyncParams,
  InventoryUpdate,
  MarketplaceConnector,
  OrderSyncParams,
  Page,
  PageParams,
  ProductSyncParams,
  ReturnSyncParams,
  TransactionSyncParams,
} from '../index';
import { TikTokClient } from './tiktok.client';
import { TIKTOK_PATHS } from './tiktok.types';
import { normalizeOrder, normalizeProduct, normalizeReturn, normalizeStatement, normalizeTransaction } from './tiktok.mapper';

interface RawPage {
  data?: { next_page_token?: string; total_count?: number };
  items?: unknown[];
  orders?: unknown[];
  returns?: unknown[];
  transactions?: unknown[];
  statements?: unknown[];
  products?: unknown[];
}

/**
 * Implementação real do contrato `MarketplaceConnector` (seção 3 do pedido) para a TikTok
 * Shop. Cada instância já está associada às credenciais de UMA loja/empresa (montada pelo
 * backend via `TikTokConnectorFactory` — ver apps/api/src/integrations/tiktok) — por isso
 * `companyId` nos métodos da interface genérica é aceito (para satisfazer o contrato
 * compartilhado com futuros conectores Shopee/Mercado Livre) mas não é usado internamente.
 */
export class TikTokConnector implements MarketplaceConnector {
  readonly provider = 'TIKTOK_SHOP' as const;

  constructor(
    private readonly client: TikTokClient,
    private readonly storeName?: string,
  ) {}

  async healthCheck(companyId: string): Promise<IntegrationHealth> {
    void companyId;
    try {
      await this.client.request('POST', TIKTOK_PATHS.productsSearch, {
        query: { page_size: '1' },
        body: {},
      });
      return { provider: this.provider, connected: true, storeName: this.storeName, lastSyncAt: new Date() };
    } catch (error) {
      return {
        provider: this.provider,
        connected: false,
        storeName: this.storeName,
        lastError: (error as Error).message,
      };
    }
  }

  async getProducts(companyId: string, params: ProductSyncParams): Promise<ExternalProductPage> {
    void companyId;
    // "Search Products" é POST — paginação (page_size/page_token) vai na query string, filtros
    // (ex.: janela de atualização) vão no corpo JSON. Ver docs/integrations/tiktok.md, seção 2.
    const raw = await this.client.request<RawPage>('POST', TIKTOK_PATHS.productsSearch, {
      query: buildPageQuery(params),
      body: params.updatedAfter ? { update_time_ge: toUnixSeconds(params.updatedAfter) } : {},
    });
    const items = raw.products ?? raw.items ?? [];
    return { items: items.map(normalizeProduct), nextPageToken: raw.data?.next_page_token };
  }

  async getOrders(companyId: string, params: OrderSyncParams): Promise<ExternalOrderPage> {
    void companyId;
    const raw = await this.client.request<RawPage>('POST', TIKTOK_PATHS.ordersSearch, {
      query: buildPageQuery(params),
      body: {
        ...(params.updatedAfter ? { update_time_ge: toUnixSeconds(params.updatedAfter) } : {}),
        ...(params.status ? { order_status: params.status } : {}),
      },
    });
    const items = raw.orders ?? raw.items ?? [];
    return { items: items.map(normalizeOrder), nextPageToken: raw.data?.next_page_token };
  }

  async getOrder(companyId: string, externalOrderId: string) {
    void companyId;
    const raw = await this.client.request<RawPage>('GET', `${TIKTOK_PATHS.orderDetail}/${externalOrderId}`);
    const item = (raw.orders ?? raw.items ?? [raw])[0];
    return normalizeOrder(item);
  }

  async getInventory(companyId: string, params: InventorySyncParams): Promise<ExternalInventory[]> {
    void companyId;
    const raw = await this.client.request<RawPage>('POST', TIKTOK_PATHS.productsSearch, {
      query: buildPageQuery(params),
      body: params.externalSkus?.length ? { seller_skus: params.externalSkus } : {},
    });
    const items = raw.products ?? raw.items ?? [];
    return items.map(normalizeProduct).map((product) => ({ externalSku: product.externalSku, available: product.stock }));
  }

  async updateInventory(companyId: string, updates: InventoryUpdate[]): Promise<void> {
    void companyId;
    await this.client.request('POST', TIKTOK_PATHS.inventoryUpdate, {
      body: { skus: updates.map((u) => ({ id: u.externalSku, inventory: [{ quantity: u.available }] })) },
    });
  }

  async getReturns(companyId: string, params: ReturnSyncParams): Promise<ExternalReturnPage> {
    void companyId;
    const raw = await this.client.request<RawPage>('POST', TIKTOK_PATHS.returnsSearch, {
      query: buildPageQuery(params),
      body: params.updatedAfter ? { update_time_ge: toUnixSeconds(params.updatedAfter) } : {},
    });
    const items = raw.returns ?? raw.items ?? [];
    return { items: items.map(normalizeReturn), nextPageToken: raw.data?.next_page_token };
  }

  async getStatements(companyId: string, params: PageParams & { updatedAfter?: Date }): Promise<ExternalStatementPage> {
    void companyId;
    const raw = await this.client.request<RawPage>('GET', TIKTOK_PATHS.financeStatements, {
      query: buildPageQuery(params),
    });
    const items = raw.statements ?? raw.items ?? [];
    return { items: items.map(normalizeStatement), nextPageToken: raw.data?.next_page_token };
  }

  async getTransactions(companyId: string, params: TransactionSyncParams): Promise<ExternalTransactionPage> {
    void companyId;
    const path = params.statementId
      ? TIKTOK_PATHS.financeStatementTransactions(params.statementId)
      : params.orderId
        ? TIKTOK_PATHS.financeOrderTransactions(params.orderId)
        : TIKTOK_PATHS.financeStatements;
    const raw = await this.client.request<RawPage>('GET', path, { query: buildPageQuery(params) });
    const items = raw.transactions ?? raw.items ?? [];
    return {
      items: items.map((item) => normalizeTransaction(item, params.statementId)),
      nextPageToken: raw.data?.next_page_token,
    };
  }
}

function buildPageQuery(params: PageParams): Record<string, string> {
  const query: Record<string, string> = {};
  if (params.pageSize) query.page_size = String(params.pageSize);
  if (params.pageToken) query.page_token = params.pageToken;
  return query;
}

function toUnixSeconds(date: Date): string {
  return String(Math.floor(date.getTime() / 1000));
}

/** Página vazia — usado quando ainda não há credenciais/loja conectada. */
export function emptyPage<T>(): Page<T> {
  return { items: [] };
}
