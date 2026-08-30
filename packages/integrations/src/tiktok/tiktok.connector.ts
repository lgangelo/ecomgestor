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
import { normalizeOrder, normalizeProductSkus, normalizeReturn, normalizeStatement, normalizeTransaction } from './tiktok.mapper';

/**
 * `TikTokClient.request` já devolve o `data` do envelope `{code, message, data}` desembrulhado
 * (ver isTikTokEnvelope em tiktok.client.ts) — `next_page_token`/`total_count` vêm direto neste
 * nível, não dentro de outro `data` aninhado. Usar `raw.data?.next_page_token` (bug corrigido)
 * fazia a paginação nunca avançar: toda busca parava sempre na primeira página, mesmo havendo
 * mais itens — confirmado em produção (só 50 de um catálogo maior apareciam na aba Produtos).
 */
interface RawPage {
  next_page_token?: string;
  total_count?: number;
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
    const rawProducts = raw.products ?? raw.items ?? [];
    const items = rawProducts.flatMap(normalizeProductSkus);
    return { items, nextPageToken: raw.next_page_token };
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
    return { items: items.map(normalizeOrder), nextPageToken: raw.next_page_token };
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
    return items.flatMap(normalizeProductSkus).map((product) => ({ externalSku: product.externalSku, available: product.stock }));
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
    return { items: items.map(normalizeReturn), nextPageToken: raw.next_page_token };
  }

  async getStatements(companyId: string, params: PageParams & { updatedAfter?: Date }): Promise<ExternalStatementPage> {
    void companyId;
    const raw = await this.client.request<RawPage>('GET', TIKTOK_PATHS.financeStatements, {
      query: buildPageQuery(params),
    });
    const items = raw.statements ?? raw.items ?? [];
    return { items: items.map(normalizeStatement), nextPageToken: raw.next_page_token };
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
      nextPageToken: raw.next_page_token,
    };
  }
}

function buildPageQuery(params: PageParams): Record<string, string> {
  const query: Record<string, string> = {};
  if (params.pageSize) query.page_size = String(params.pageSize);
  if (params.pageToken) query.page_token = params.pageToken;
  return query;
}

/**
 * Sempre usado dentro do corpo JSON (nunca na query string), onde o tipo importa de verdade —
 * confirmado em produção: mandar como string dá "param update_time_ge type invalid. actual
 * type:string, expected type:int64". A TikTok exige um número JSON de verdade, não um texto.
 */
function toUnixSeconds(date: Date): number {
  return Math.floor(date.getTime() / 1000);
}

export interface TikTokAuthorizedShop {
  shopId: string;
  shopCipher: string;
  shopName?: string;
  region?: string;
}

interface RawAuthorizedShops {
  shops?: Array<{ id?: string; cipher?: string; name?: string; region?: string }>;
}

/**
 * Chamado uma vez logo após a troca do `code` OAuth por token (nunca vem no próprio token) —
 * é o único jeito documentado (tabela de erros do Partner Center, código 106013) de obter o
 * `shop_cipher` exigido por quase toda chamada de negócio. Recebe um `TikTokClient` sem
 * `shopCipher` configurado (esta chamada não aceita/precisa dele). Exige o escopo "Shop
 * Authorized Information" (seller.authorization.info) — sem ele dá "Access denied" (código
 * 105005); "Get Active Shop List" (`/seller/{version}/shops`) foi tentado antes mas não retorna
 * cipher para um Custom App local (BR), só id/region.
 */
export async function getAuthorizedShops(client: TikTokClient): Promise<TikTokAuthorizedShop[]> {
  const raw = await client.request<RawAuthorizedShops>('GET', TIKTOK_PATHS.authorizedShops);
  return (raw.shops ?? [])
    .filter((shop): shop is { id: string; cipher: string; name?: string; region?: string } =>
      Boolean(shop.id && shop.cipher),
    )
    .map((shop) => ({ shopId: shop.id, shopCipher: shop.cipher, shopName: shop.name, region: shop.region }));
}

/** Página vazia — usado quando ainda não há credenciais/loja conectada. */
export function emptyPage<T>(): Page<T> {
  return { items: [] };
}
