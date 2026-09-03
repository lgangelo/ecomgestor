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
  /** A confirmar no Partner Center. */
  inventoryUpdate: `/product/${API_VERSION}/products/inventory/update`,
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
