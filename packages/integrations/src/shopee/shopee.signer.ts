import { createHmac } from 'node:crypto';

/**
 * Assinatura de chamadas da Shopee Open API (HMAC-SHA256) — CONFIRMADO por múltiplas fontes de
 * terceiros convergindo na mesma fórmula geral (ver docs/integrations/shopee.md, seção 1), mas
 * NUNCA verificado contra uma chamada real. Mais simples que a da TikTok (que assina path + query
 * ordenada + corpo): aqui só o `path` (sem query string nem corpo) entra na base.
 *
 * Três variações da base string, dependendo do tipo de endpoint (a Shopee documenta cada
 * endpoint como pertencendo a uma delas — não confirmado aqui qual endpoint usa qual):
 *   1. Público (antes de existir token, ex.: trocar `code` por token): partner_id + path + timestamp
 *   2. De loja (a maioria — pedidos, produtos, estoque): + access_token + shop_id
 *   3. De conta principal/merchant: + access_token + merchant_id
 *
 * O `sign` resultante vai na QUERY STRING da requisição (mesmo em POST) — o corpo JSON carrega só
 * os parâmetros de negócio, nunca os de autenticação. Isso é diferente da TikTok, que também
 * assina o corpo.
 */
export function signShopeeRequest(params: {
  partnerId: string;
  partnerKey: string;
  path: string;
  timestamp: number;
  accessToken?: string;
  shopId?: string;
  merchantId?: string;
}): string {
  const { partnerId, partnerKey, path, timestamp, accessToken, shopId, merchantId } = params;
  let base = `${partnerId}${path}${timestamp}`;
  if (accessToken) base += accessToken;
  if (shopId) base += shopId;
  else if (merchantId) base += merchantId;
  return createHmac('sha256', partnerKey).update(base, 'utf8').digest('hex');
}
