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
import { TikTokApiError } from './tiktok.errors';
import { TIKTOK_PATHS } from './tiktok.types';
import {
  extractMainImageUrl,
  extractSkuAttributes,
  extractDescription,
  normalizeOrder,
  normalizeProductSkus,
  normalizeReturn,
  normalizeStatement,
  normalizeTransaction,
} from './tiktok.mapper';

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
  /** "Get Transactions by Statement" pode responder com esta chave (nome do path,
   * `statement_transactions`) em vez da genérica `transactions` — ainda não confirmado contra
   * produção (0 transações sincronizadas em 87 statements é sinal forte de chave errada). */
  statement_transactions?: unknown[];
  statements?: unknown[];
  products?: unknown[];
}

/** Limite de segurança pra `getInventory` paginar sozinho (ver comentário no método) — 50
 * páginas cobre milhares de SKUs mapeadas, bem além do que uma loja real teria hoje. */
const MAX_INVENTORY_PAGES = 50;

/** Formato real de erro por SKU de "Update Inventory" — confirmado contra o exemplo oficial da
 * doc (partner.tiktokshop.com/docv2/page/update-inventory-202309): `code: 0` no envelope mesmo
 * com isto preenchido, então precisa ser conferido explicitamente (ver `updateInventory`). */
interface UpdateInventoryResponseData {
  errors?: Array<{
    code: number;
    message: string;
    detail?: {
      sku_id?: string;
      extra_errors?: Array<{ warehouse_id?: string; code: number; message: string }>;
    };
  }>;
}

// Debug temporário: loga só a primeira transação real vista no processo, para confirmar os
// campos de tipo (`type`/`transaction_type`) e referência ao pedido (`order_id`) sem inundar o
// log — 146 transações sincronizadas mas nenhuma taxa aparecendo no pedido é sinal de que um dos
// dois nomes de campo assumidos em `normalizeTransaction`/`TRANSACTION_TYPE_MAP` está errado.
let loggedFirstTransaction = false;

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
        ...(params.createdAfter ? { create_time_ge: toUnixSeconds(params.createdAfter) } : {}),
        ...(params.status ? { order_status: params.status } : {}),
      },
    });
    const rawOrders = raw.orders ?? raw.items ?? [];
    // TEMPORÁRIO — remover depois de confirmar em produção que o campo `id` (não `order_id`)
    // resolve o externalOrderId e que os demais campos (line_items, payment) batem.
    if (rawOrders[0]) console.log('[tiktok-order-debug]', JSON.stringify(rawOrders[0]));
    const items = rawOrders.map(normalizeOrder);
    return { items, nextPageToken: raw.next_page_token };
  }

  async getOrder(companyId: string, externalOrderId: string) {
    void companyId;
    // Confirmado em produção: path com o id anexado ("/orders/{id}", igual ao padrão usado em
    // "Get Product") dá "Invalid path" — "Get Order Detail" não segue o mesmo padrão de outros
    // recursos da TikTok Shop; usa o path base + `ids` como query param (formato de busca em
    // lote, mesmo para um único id), não um path parameter.
    const raw = await this.client.request<RawPage>('GET', TIKTOK_PATHS.orderDetail, {
      query: { ids: JSON.stringify([externalOrderId]) },
    });
    const item = (raw.orders ?? raw.items ?? [raw])[0];
    return normalizeOrder(item);
  }

  /**
   * Busca sob demanda a imagem principal, a descrição E os atributos (cor/tamanho) de cada SKU
   * de UM produto ("Get Product") — "Search Products" (usado para listar/sincronizar em massa)
   * confirmadamente não traz nenhum dos três, então esta chamada extra só é feita na
   * criação/vínculo de um produto específico, nunca durante a listagem em massa (evita
   * multiplicar centenas de chamadas por sync) — e uma única chamada já resolve tudo junto, nunca
   * chamadas separadas para o mesmo produto. Nunca lança: falha silenciosamente com valores
   * vazios — todos os três são "nice to have", nunca devem travar a criação do produto.
   * `main_images`/`sales_attributes` confirmados contra payload real de produção; `description`
   * ainda não foi confirmado contra um payload real — verificar após o primeiro deploy se o
   * campo popula com o texto certo (nome do campo pode precisar de ajuste).
   */
  async getProductDetail(
    companyId: string,
    externalProductId: string,
  ): Promise<{
    imageUrl?: string;
    description?: string;
    skus: Array<{ externalSku: string; color?: string; size?: string; imageUrl?: string }>;
  }> {
    void companyId;
    try {
      const raw = await this.client.request<Record<string, unknown>>(
        'GET',
        TIKTOK_PATHS.productDetail(externalProductId),
      );
      const rawSkus = Array.isArray(raw.skus) ? (raw.skus as unknown[]) : [];
      const skus = rawSkus.map((rawSku) => {
        const sku = (rawSku ?? {}) as Record<string, unknown>;
        const { color, size, imageUrl } = extractSkuAttributes(sku);
        return { externalSku: String(sku.id ?? ''), color, size, imageUrl };
      });
      return { imageUrl: extractMainImageUrl(raw), description: extractDescription(raw), skus };
    } catch (error) {
      // eslint-disable-next-line no-console -- diagnóstico best-effort, nunca deve travar a criação do produto
      console.warn('[tiktok-product-detail-error]', (error as Error).message);
      return { imageUrl: undefined, description: undefined, skus: [] };
    }
  }

  /**
   * Sem paginação interna, comparava só a PRIMEIRA página de `products/search` (o tamanho de
   * página padrão da TikTok pra este endpoint nunca foi confirmado, mas certamente é menor que
   * um catálogo real inteiro) — qualquer SKU mapeado além da primeira página nunca era
   * comparado, e como `TikTokInventorySyncService.compare()` trata "não achado" como "não
   * divergente" (nunca como erro), uma divergência real de estoque num produto assim ficava
   * completamente invisível, sem nenhum aviso. Diferente dos outros endpoints paginados (onde
   * quem pagina é o service chamador, na API), aqui pagina dentro do próprio conector — o
   * chamador (`compare()`) só quer "todo o estoque externo dessas SKUs", não uma página de
   * cada vez.
   *
   * CONFIRMADO em produção: `params.externalSkus` (o que `channel_product_mapping.externalSku`
   * guarda) é o `id` da SKU no nível do recurso — nunca `seller_sku` (o código que o VENDEDOR
   * atribui, um campo totalmente diferente). Mandar esses valores como filtro `seller_skus` no
   * corpo da busca nunca acha nada (chaves de universos diferentes) — a comparação de estoque
   * sempre voltava "SKU não encontrado" para tudo. Sem filtro server-side confiável, busca o
   * catálogo inteiro (já paginado) e filtra client-side pelo `id` de verdade.
   */
  async getInventory(companyId: string, params: InventorySyncParams): Promise<ExternalInventory[]> {
    void companyId;
    const results: ExternalInventory[] = [];
    let pageToken: string | undefined = params.pageToken;

    for (let page = 0; page < MAX_INVENTORY_PAGES; page++) {
      const raw: RawPage = await this.client.request<RawPage>('POST', TIKTOK_PATHS.productsSearch, {
        query: buildPageQuery({ ...params, pageToken }),
        body: {},
      });
      const items = raw.products ?? raw.items ?? [];
      results.push(
        ...items.flatMap(normalizeProductSkus).map((product) => ({ externalSku: product.externalSku, available: product.stock })),
      );

      if (!raw.next_page_token) break;
      pageToken = raw.next_page_token;
    }

    if (!params.externalSkus?.length) return results;
    const wanted = new Set(params.externalSkus);
    return results.filter((r) => wanted.has(r.externalSku));
  }

  /** "Update Inventory" exige um `product_id` só por chamada (é parte do path, não do corpo) —
   * agrupa as atualizações por produto e faz uma chamada por grupo, mesmo que hoje o chamador
   * real (`TikTokInventorySyncService.push`) sempre mande uma única atualização por vez.
   *
   * ACHADO REAL: o exemplo oficial de resposta desse endpoint mostra `code: 0` (sucesso) no
   * envelope geral MESMO quando um SKU específico falha — o erro real fica só dentro de
   * `data.errors[]` (ex.: `{code: 12052097, message: "The warehouse does not exist"}`). Como
   * `TikTokClient.request` só olha o `code` do envelope, uma falha por SKU passava batendo como
   * sucesso — o estoque nunca chegava a mudar na TikTok e ninguém via erro nenhum. Por isso este
   * método confere `data.errors` explicitamente e lança um erro real se vier algo lá. */
  async updateInventory(companyId: string, updates: InventoryUpdate[]): Promise<void> {
    void companyId;
    const byProduct = new Map<string, InventoryUpdate[]>();
    for (const update of updates) {
      const group = byProduct.get(update.externalProductId);
      if (group) group.push(update);
      else byProduct.set(update.externalProductId, [update]);
    }

    for (const [productId, group] of byProduct) {
      const data = await this.client.request<UpdateInventoryResponseData>('POST', TIKTOK_PATHS.inventoryUpdate(productId), {
        body: { skus: group.map((u) => ({ id: u.externalSku, inventory: [{ quantity: u.available }] })) },
      });
      if (data?.errors?.length) {
        const message = data.errors
          .map((e) => {
            const extra = e.detail?.extra_errors?.map((x) => x.message).join('; ');
            return `SKU ${e.detail?.sku_id ?? '?'}: ${e.message}${extra ? ` (${extra})` : ''}`;
          })
          .join(' | ');
        throw new TikTokApiError(message, 'VALIDATION');
      }
    }
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
    // Falha confirmada em produção sem isto: "SortField is a required field and has not been
    // provided" — a TikTok exige sort_field/sort_order em "Get Statements". `statement_time` é o
    // único campo de data do recurso; ainda não confirmado 100% contra a lista de valores aceitos
    // pela API (a tela de Jobs mostra o erro exato se o valor estiver errado).
    const raw = await this.client.request<RawPage>('GET', TIKTOK_PATHS.financeStatements, {
      query: { ...buildPageQuery(params), sort_field: 'statement_time', sort_order: 'DESC' },
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
    // Confirmado em produção (erro exato da API, depois de já ter corrigido o path para o
    // endpoint certo): "SortField is invalid, allowed values: order_create_time" — nem
    // `create_time` nem `statement_time` (chutes anteriores) são aceitos aqui; este endpoint
    // (transações por statement/pedido) ordena por data de criação do PEDIDO, não do statement.
    const raw = await this.client.request<RawPage>('GET', path, {
      query: { ...buildPageQuery(params), sort_field: 'order_create_time', sort_order: 'DESC' },
    });
    const items = raw.transactions ?? raw.statement_transactions ?? raw.items ?? [];
    if (items.length === 0) {
      // eslint-disable-next-line no-console -- debug temporário: 0 transações sincronizadas em produção mesmo com >80 statements é suspeito
      console.log('[tiktok-transactions-empty-debug]', JSON.stringify({ path, keys: Object.keys(raw) }));
    } else if (!loggedFirstTransaction) {
      loggedFirstTransaction = true;
      // eslint-disable-next-line no-console -- debug temporário, remover após confirmar o campo real de tipo/order_id da transação
      console.log('[tiktok-transaction-debug]', JSON.stringify(items[0]));
    }
    return {
      items: items.map((item) => normalizeTransaction(item, params.statementId)),
      nextPageToken: raw.next_page_token,
    };
  }

  /**
   * Diagnóstico "Get Payments" — devolve o payload bruto sem nenhuma normalização, de propósito:
   * nem os nomes de campo nem a exigência de `sort_field` (como em `getStatements`) foram
   * confirmados ainda contra a conta real desta empresa. Usado só pelo `check-settlements` CLI
   * até um payload real justificar escrever um `normalizePayment` de verdade — nunca chamado pelo
   * fluxo de sincronização normal. (`/transactions/unsettled`, tentado antes, não existe —
   * "Invalid path" confirmado em produção; `financePayments` é a próxima candidata.)
   */
  async getPaymentsRaw(companyId: string): Promise<unknown> {
    void companyId;
    return this.client.request('GET', TIKTOK_PATHS.financePayments, {
      query: { page_size: '20', sort_field: 'create_time', sort_order: 'DESC' },
    });
  }

  /** Payload bruto de "Get Product", sem passar pelo mapper — usado só pelo CLI de diagnóstico
   * `check-tiktok-product-detail-raw` pra confirmar o formato EXATO de `sku_img` dentro de
   * `sales_attributes` (visto e citado em comentário, mas nunca inspecionado byte a byte —
   * `extractSkuAttributes`/`extractSkuImageUrl` foram escritos de forma defensiva justamente
   * por essa incerteza). Nunca chamado pelo fluxo de sincronização normal. */
  async getProductDetailRaw(companyId: string, externalProductId: string): Promise<unknown> {
    void companyId;
    return this.client.request('GET', TIKTOK_PATHS.productDetail(externalProductId));
  }

  /** Repassa pro "Upload Product File" do cliente — ver comentário em `TikTokClient.uploadProductFile`
   * (NÃO CONFIRMADO ainda contra uma chamada real nesta conta). Usado hoje só pelo CLI de
   * diagnóstico `check-tiktok-upload-product-file`; nunca chamado pelo fluxo de sincronização
   * normal até essa confirmação acontecer. */
  async uploadProductFile(buffer: Buffer, filename: string): Promise<Record<string, unknown>> {
    return this.client.uploadProductFile({ buffer, filename });
  }

  /** Repassa pros novos métodos do cliente (publicação de produto — pedido do usuário) — todos
   * NÃO CONFIRMADOS ainda contra uma chamada real nesta conta, ver comentário de cada um em
   * `TikTokClient`. Nunca chamados pelo fluxo de sincronização automático até a confirmação. */
  async uploadImage(buffer: Buffer, filename: string, useCase: Parameters<TikTokClient['uploadImage']>[0]['useCase']) {
    return this.client.uploadImage({ buffer, filename, useCase });
  }

  async getCategories(params?: Parameters<TikTokClient['getCategories']>[0]) {
    return this.client.getCategories(params);
  }

  async getCategoryRules(categoryId: string, categoryVersion?: 'v1' | 'v2') {
    return this.client.getCategoryRules(categoryId, categoryVersion);
  }

  async getCategoryAttributes(categoryId: string, categoryVersion?: 'v1' | 'v2') {
    return this.client.getCategoryAttributes(categoryId, categoryVersion);
  }

  async getWarehouses() {
    return this.client.getWarehouses();
  }

  async createProduct(payload: Parameters<TikTokClient['createProduct']>[0]) {
    return this.client.createProduct(payload);
  }

  async partialEditProduct(productId: string, payload: Parameters<TikTokClient['partialEditProduct']>[1]) {
    return this.client.partialEditProduct(productId, payload);
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
