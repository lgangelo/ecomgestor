/**
 * Hosts e paths da Shopee Open Platform (Open API v2). NADA aqui foi confirmado contra a
 * documentação oficial em primeira mão (o fetch automatizado de `open.shopee.com` foi recusado
 * durante a pesquisa) — todos os valores vêm de SDKs de terceiros e agregadores, cruzados entre
 * si (ver docs/integrations/shopee.md para as fontes e o nível de confiança de cada um). Antes
 * de qualquer chamada de negócio real, confirmar contra uma conta de sandbox de verdade — ver
 * "Próximos passos" no mesmo documento.
 */
export const SHOPEE_HOSTS = {
  production: 'https://partner.shopeemobile.com',
  sandbox: 'https://partner.test-stable.shopeemobile.com',
} as const;

export const SHOPEE_PATHS = {
  /** Troca do `code` de autorização por token — path citado por mais de uma fonte independente. */
  tokenGet: '/api/v2/auth/token/get',
  /** Renovação de access_token — mesmo nível de confiança do path acima. */
  tokenRefresh: '/api/v2/auth/access_token/get',
} as const;

export interface ShopeeCredentials {
  shopId?: string;
  merchantId?: string;
  shopName?: string;
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: Date;
  /** Citado como ~30 dias por mais de uma fonte, mas com menos consistência que a validade do
   * access_token (4h) — trate como não confirmado com certeza total (ver shopee.md, seção 1). */
  refreshTokenExpiresAt: Date;
}

export interface ShopeeTokenResponse {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: Date;
  refreshTokenExpiresAt: Date;
  shopId?: string;
  merchantId?: string;
}
