/**
 * Hosts e paths da TikTok Shop Open API. Hosts e o mecanismo de assinatura foram confirmados
 * na pesquisa oficial (docs/integrations/tiktok.md). Os paths marcados "a confirmar" seguem o
 * padrão público de versionamento por data da TikTok Shop Open API, mas não puderam ser
 * extraídos com certeza absoluta do Partner Center (SPA renderizada via JS, inacessível a
 * fetch automatizado neste ambiente) — nunca inventados, apenas centralizados aqui para que a
 * confirmação final (com conta real no Partner Center) seja uma troca de string, não um
 * redesenho. Ver docs/integrations/tiktok.md para o detalhe de cada item.
 */
export const TIKTOK_HOSTS = {
  auth: 'https://auth.tiktok-shops.com',
  api: 'https://open-api.tiktokglobalshop.com',
} as const;

const API_VERSION = '202309';
// CONFIRMADO via documentação oficial navegada diretamente (partner.tiktokshop.com/docv2) —
// "Partial Edit Product" só existe na geração `202509` da API (mais nova que a usada pelo resto
// da integração); "Create Product"/"Get Categories"/"Get Attributes"/"Get Warehouse List"/"Upload
// Image" continuam na `202309`. Nunca assumir que todo endpoint de produto usa a mesma versão.
const PARTIAL_EDIT_API_VERSION = '202509';

export const TIKTOK_PATHS = {
  /** Confirmado (docs/integrations/tiktok.md, item 2/6/7). */
  tokenRefresh: '/api/v2/token/refresh',
  /** A confirmar no Partner Center — padrão público conhecido, não extraído com certeza. */
  tokenExchange: '/api/v2/token/get',
  /** "Get Authorized Shops" — confirmado na documentação oficial (tabela de erros, código
   * 106013 "Missing identifier. The shop_cipher query parameter is required...") como a fonte
   * oficial do `shop_cipher`. Exige o escopo "Shop Authorized Information" (seller.authorization.info)
   * — sem ele dá "Access denied" (código 105005) e o Partner Center nem deixa testar com a
   * chave do app. `/seller/{version}/shops` ("Get Active Shop List") foi tentado antes mas só
   * retorna id/region, sem cipher, para um Custom App local (BR) — não é o endpoint certo. */
  authorizedShops: `/authorization/${API_VERSION}/shops`,
  /** "Get Active Shop List" — mantido só de referência; não retorna shop_cipher para Custom
   * App local (confirmado em produção). Usar `authorizedShops` acima. */
  activeShopList: `/seller/${API_VERSION}/shops`,
  /** A confirmar no Partner Center. */
  productsSearch: `/product/${API_VERSION}/products/search`,
  /** "Get Product" — detalhe completo de UM produto. Confirmado em produção que "Search
   * Products" acima NÃO traz nenhum campo de imagem (payload bruto logado, sem main_images
   * nem qualquer outro campo de imagem) — este é o único jeito de obter a foto do produto,
   * uma chamada por produto. Path a confirmar no Partner Center (segue o padrão público). */
  productDetail: (productId: string) => `/product/${API_VERSION}/products/${productId}`,
  /** "Update Inventory" — CONFIRMADO contra a documentação oficial real (partner.tiktokshop.com/
   * docv2/page/update-inventory-202309): o `product_id` é parte do PATH, não só do corpo — o path
   * antigo (`/product/{version}/products/inventory/update`, sem o id) sempre dava "Invalid path"
   * em produção. Corpo: `{ skus: [{ id, inventory: [{ warehouse_id, quantity, ... }] }] }` — o
   * `warehouse_id` por SKU aparece no exemplo oficial; ainda NÃO confirmado se é obrigatório para
   * uma conta com um único armazém (tentamos sem primeiro; os códigos de erro documentados
   * 12019022/12052037/12052097 tornam um eventual requisito de warehouse_id fácil de identificar
   * no próximo erro real, via check-stock-outbox-errors). */
  inventoryUpdate: (productId: string) => `/product/${API_VERSION}/products/${productId}/inventory/update`,
  /** A confirmar no Partner Center. */
  ordersSearch: `/order/${API_VERSION}/orders/search`,
  /** "Get Order Detail" — confirmado em produção que NÃO segue o padrão de path parameter usado
   * por "Get Product" (`/orders/{id}` dá "Invalid path"); usa o path base + `ids` como query
   * param (formato de busca em lote, mesmo para um único id). Formato exato do valor de `ids`
   * (JSON stringificado de array) ainda não confirmado contra um payload de sucesso real. */
  orderDetail: `/order/${API_VERSION}/orders`,
  /** A confirmar no Partner Center. */
  returnsSearch: `/return_refund/${API_VERSION}/returns/search`,
  /** Fluxo confirmado (Get Statements → Get Transactions by Statement/Order); paths a confirmar. */
  financeStatements: `/finance/${API_VERSION}/statements`,
  financeStatementTransactions: (statementId: string) =>
    `/finance/${API_VERSION}/statements/${statementId}/statement_transactions`,
  financeOrderTransactions: (orderId: string) => `/finance/${API_VERSION}/orders/${orderId}/statement_transactions`,
  /** "Get Unsettled Transactions" — TENTATIVA, rejeitada pela TikTok em produção ("Invalid
   * path"): `/finance/${API_VERSION}/transactions/unsettled` não existe. Mantido comentado como
   * registro de que esse chute (só de um blog de terceiro, nunca de fonte oficial) NÃO é o path
   * certo — não reusar. */
  /** "Get Payments" — lista de lotes de repasse (cada um com `status`); path CONFIRMADO contra um
   * SDK open-source real (github.com/hsib19/tiktok-shop-sdk, com link para a doc oficial
   * `get-payments-202309`), mesmo padrão de versão dos demais endpoints de finance já usados
   * aqui. Ainda não testado contra a conta real desta empresa — é a melhor candidata a fonte do
   * saldo "a receber" de curto prazo, mas só usar de verdade depois de ver o payload real. */
  financePayments: `/finance/${API_VERSION}/payments`,
  /** "Get Categories" — CONFIRMADO via documentação oficial (partner.tiktokshop.com/docv2/page/
   * get-categories-202309). Query: `locale`/`keyword`/`category_version` (`v2` = árvore de 7
   * níveis, obrigatório em US/EU/SEA; `v1` = 3 níveis, default nas demais regiões, inclusive BR —
   * nunca assumir qual sem confirmar contra a conta real)/`listing_platform`. */
  categories: `/product/${API_VERSION}/categories`,
  /** "Get Category Rules" — CONFIRMADO (get-category-rules-202309): requisitos extras da
   * categoria (certificações, size chart, dimensões obrigatórias, se aceita pré-venda, etc.). */
  categoryRules: (categoryId: string) => `/product/${API_VERSION}/categories/${categoryId}/rules`,
  /** "Get Attributes" — CONFIRMADO (get-attributes-202309): equivalente ao `getCategoryAttributes`
   * do Mercado Livre (attribute id/value_id), mas com `is_customizable` (aceita valor customizado
   * além do catálogo fechado) e `requirement_conditions` (atributo que só existe dependendo do
   * valor de outro). */
  categoryAttributes: (categoryId: string) => `/product/${API_VERSION}/categories/${categoryId}/attributes`,
  /** "Get Warehouse List" — CONFIRMADO (get-warehouse-list-202309). ATENÇÃO: base path
   * `/logistics/`, não `/product/` como todo o resto — escopo de app diferente
   * (`seller.logistics`, não `seller.product.*`). `warehouse_id` é obrigatório em cada SKU do
   * Create Product. */
  warehouses: `/logistics/${API_VERSION}/warehouses`,
  /** "Upload Product Image" — CONFIRMADO (upload-product-image-202309), multipart/form-data
   * (`data` + `use_case`). ACHADO REAL da doc: "You will not be able to use any image URLs that
   * are not hosted by TikTok Shop" — nunca manda a URL do nosso R2 direto, sempre faz upload
   * aqui primeiro e usa o `uri` (não a `url` completa) devolvido. */
  imagesUpload: `/product/${API_VERSION}/images/upload`,
  /** "Create Product" — CONFIRMADO (create-product-202309). `save_mode: "AS_DRAFT"` cria sem
   * publicar de verdade; default é `"LISTING"` (publica). */
  products: `/product/${API_VERSION}/products`,
  /** "Partial Edit Product" — CONFIRMADO (partial-edit-product-202509). Método POST (não PUT/
   * PATCH, apesar do nome) — versão `202509`, não `202309` (ver `PARTIAL_EDIT_API_VERSION`
   * acima). Parcial só no nível de campo de topo (`description`, `title`, etc. isolados não
   * afetam o resto); um objeto aninhado (ex. um SKU dentro de `skus[]`) precisa vir COMPLETO,
   * senão os campos omitidos dele são zerados. Não inclui `category_id` — trocar categoria exige
   * o Edit Product completo (PUT, geração mais antiga) ou uma "Category Upgrade Task" separada,
   * nenhum dos dois confirmado/implementado aqui ainda. */
  productPartialEdit: (productId: string) => `/product/${PARTIAL_EDIT_API_VERSION}/products/${productId}/partial_edit`,
  /** "Upload Product File" — vídeo/PDF de produto. Ver `TikTokClient.uploadProductFile`. */
  filesUpload: `/product/${API_VERSION}/files/upload`,
  /** "Deactivate Products" — CONFIRMADO (deactivate-products-202309). Corpo:
   * `{ product_ids: string[] }` (máx. 20). Esconde o produto dos compradores, sem excluir —
   * status vira `Seller_deactivated`. */
  productsDeactivate: `/product/${API_VERSION}/products/deactivate`,
  /** "Activate Product" — CONFIRMADO (activate-product-202309). Mesmo corpo do deactivate.
   * Reativar manda o produto pra revisão de novo (status `Pending` até a TikTok aprovar). */
  productsActivate: `/product/${API_VERSION}/products/activate`,
} as const;

export interface TikTokCredentials {
  shopId?: string;
  /** Exigido como `shop_cipher` em quase toda chamada de negócio — distinto do shopId, só é
   * obtido via "Get Authorized Shops" (TIKTOK_PATHS.authorizedShops), nunca vem no token OAuth. */
  shopCipher?: string;
  sellerName?: string;
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: Date;
  refreshTokenExpiresAt: Date;
  scopes?: string;
  region?: string;
}

export interface TikTokTokenResponse {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: Date;
  refreshTokenExpiresAt: Date;
  openId: string;
  sellerName?: string;
  shopId?: string;
}

/** Envelope de resposta padrão observado nas APIs da TikTok Shop: { code, message, data }. */
export interface TikTokEnvelope<T> {
  code: number;
  message: string;
  data: T;
}

export function isTikTokEnvelope(value: unknown): value is TikTokEnvelope<unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    'code' in value &&
    typeof (value as Record<string, unknown>).code === 'number'
  );
}
