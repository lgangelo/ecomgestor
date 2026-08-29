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
  /** "Get Authorized Shops" — confirmado em produção que NÃO funciona para Custom Apps (só
   * Public Apps multi-shop; o Partner Center recusa até testar com a chave de um Custom App).
   * Mantido só de referência — usar `activeShopList` abaixo. */
  authorizedShops: `/authorization/${API_VERSION}/shops`,
  /** "Get Active Shop List" — confirmado em produção como o equivalente que FUNCIONA para
   * Custom Apps: retorna a(s) loja(s) ativas para o access_token atual (id/cipher/region),
   * único jeito de obter o shop_cipher exigido pelos demais endpoints de negócio (o token OAuth
   * em si nunca inclui shop_id/shop_cipher — só seller_name/seller_base_region/open_id). */
  activeShopList: `/seller/${API_VERSION}/shops`,
  /** A confirmar no Partner Center. */
  productsSearch: `/product/${API_VERSION}/products/search`,
  /** A confirmar no Partner Center. */
  inventoryUpdate: `/product/${API_VERSION}/products/inventory/update`,
  /** A confirmar no Partner Center. */
  ordersSearch: `/order/${API_VERSION}/orders/search`,
  /** A confirmar no Partner Center. */
  orderDetail: `/order/${API_VERSION}/orders`,
  /** A confirmar no Partner Center. */
  returnsSearch: `/return_refund/${API_VERSION}/returns/search`,
  /** Fluxo confirmado (Get Statements → Get Transactions by Statement/Order); paths a confirmar. */
  financeStatements: `/finance/${API_VERSION}/statements`,
  financeStatementTransactions: (statementId: string) =>
    `/finance/${API_VERSION}/statements/${statementId}/statement_transactions`,
  financeOrderTransactions: (orderId: string) => `/finance/${API_VERSION}/orders/${orderId}/statement_transactions`,
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
