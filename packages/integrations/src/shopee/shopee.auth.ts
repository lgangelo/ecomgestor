import { SHOPEE_HOSTS, SHOPEE_PATHS, ShopeeTokenResponse } from './shopee.types';
import { signShopeeRequest } from './shopee.signer';
import { ShopeeApiError } from './shopee.errors';

/**
 * OAuth da Shopee Open Platform — só as funções puras de montar a URL de autorização e trocar/
 * renovar token. Estado do fluxo (equivalente ao `state` já usado para a TikTok), lock de
 * refresh concorrente e persistência de credenciais continuam responsabilidade do backend
 * (apps/api/src/integrations/shopee), este arquivo não conhece Redis nem banco de dados —
 * mesmo desenho de `tiktok.auth.ts`.
 *
 * `sandbox` escolhe entre `partner.shopeemobile.com` (produção) e
 * `partner.test-stable.shopeemobile.com` (sandbox, confirmado como público e estável pelas
 * fontes consultadas) — usar sandbox primeiro é o próprio próximo passo recomendado em
 * docns/integrations/shopee.md antes de testar contra uma loja real.
 */
export function buildShopeeAuthorizeUrl(params: {
  partnerId: string;
  partnerKey: string;
  redirectUri: string;
  sandbox: boolean;
}): string {
  const { partnerId, partnerKey, redirectUri, sandbox } = params;
  // NÃO CONFIRMADO: nenhuma fonte consultada durante a pesquisa (docs/integrations/shopee.md)
  // citou o path exato da tela de autorização em si (só o de troca de code por token). Path
  // abaixo segue o padrão público mais comumente citado para a Shopee Open API v2 — precisa ser
  // confirmado contra o Open Platform real antes de virar premissa (mesmo espírito de
  // `tiktok.types.ts`, que teve paths "a confirmar" corrigidos depois de testar em produção).
  const path = '/api/v2/shop/auth_partner';
  const timestamp = Math.floor(Date.now() / 1000);
  const sign = signShopeeRequest({ partnerId, partnerKey, path, timestamp });

  const host = sandbox ? SHOPEE_HOSTS.sandbox : SHOPEE_HOSTS.production;
  const url = new URL(`${host}${path}`);
  url.searchParams.set('partner_id', partnerId);
  url.searchParams.set('timestamp', String(timestamp));
  url.searchParams.set('sign', sign);
  url.searchParams.set('redirect', redirectUri);
  return url.toString();
}

export async function exchangeShopeeAuthorizationCode(params: {
  partnerId: string;
  partnerKey: string;
  code: string;
  shopId?: string;
  mainAccountId?: string;
  sandbox: boolean;
}): Promise<ShopeeTokenResponse> {
  const { partnerId, partnerKey, code, shopId, mainAccountId, sandbox } = params;
  const timestamp = Math.floor(Date.now() / 1000);
  // Endpoint de troca de código é PÚBLICO (sem access_token ainda) — variação 1 da assinatura
  // (ver shopee.signer.ts).
  const sign = signShopeeRequest({ partnerId, partnerKey, path: SHOPEE_PATHS.tokenGet, timestamp });

  const host = sandbox ? SHOPEE_HOSTS.sandbox : SHOPEE_HOSTS.production;
  const url = new URL(`${host}${SHOPEE_PATHS.tokenGet}`);
  url.searchParams.set('partner_id', partnerId);
  url.searchParams.set('timestamp', String(timestamp));
  url.searchParams.set('sign', sign);

  const body: Record<string, unknown> = { code, partner_id: Number(partnerId) };
  if (shopId) body.shop_id = Number(shopId);
  if (mainAccountId) body.main_account_id = Number(mainAccountId);

  return fetchAndParseToken(url, body);
}

export async function refreshShopeeAccessToken(params: {
  partnerId: string;
  partnerKey: string;
  refreshToken: string;
  shopId?: string;
  mainAccountId?: string;
  sandbox: boolean;
}): Promise<ShopeeTokenResponse> {
  const { partnerId, partnerKey, refreshToken, shopId, mainAccountId, sandbox } = params;
  const timestamp = Math.floor(Date.now() / 1000);
  const sign = signShopeeRequest({ partnerId, partnerKey, path: SHOPEE_PATHS.tokenRefresh, timestamp });

  const host = sandbox ? SHOPEE_HOSTS.sandbox : SHOPEE_HOSTS.production;
  const url = new URL(`${host}${SHOPEE_PATHS.tokenRefresh}`);
  url.searchParams.set('partner_id', partnerId);
  url.searchParams.set('timestamp', String(timestamp));
  url.searchParams.set('sign', sign);

  const body: Record<string, unknown> = { refresh_token: refreshToken, partner_id: Number(partnerId) };
  if (shopId) body.shop_id = Number(shopId);
  if (mainAccountId) body.main_account_id = Number(mainAccountId);

  return fetchAndParseToken(url, body);
}

async function fetchAndParseToken(url: URL, body: Record<string, unknown>): Promise<ShopeeTokenResponse> {
  let response: Response;
  try {
    response = await fetch(url.toString(), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (error) {
    throw new ShopeeApiError(`Falha de rede na autenticação Shopee: ${(error as Error).message}`, 'TEMPORARY');
  }

  const json: unknown = await response.json().catch(() => null);
  const envelope = json as { error?: string; message?: string } | null;

  // A Shopee reporta erro via um campo `error` (código) + `message` no corpo, mesmo com HTTP 200
  // em alguns casos — mesmo cuidado já confirmado necessário para a TikTok (ver tiktok.auth.ts).
  // NÃO CONFIRMADO: se isso realmente acontece com HTTP 200 para a Shopee ou só HTTP não-200;
  // tratamos os dois casos aqui até confirmar.
  if (!response.ok || (envelope?.error && envelope.error.length > 0)) {
    const message = envelope?.message || envelope?.error || `Erro HTTP ${response.status} ao obter token da Shopee`;
    throw new ShopeeApiError(message, response.status === 401 || response.status === 403 ? 'AUTH' : 'TEMPORARY', response.status);
  }

  const data = json as Record<string, unknown>;
  const accessToken = data.access_token ? String(data.access_token) : '';
  const refreshToken = data.refresh_token ? String(data.refresh_token) : '';
  if (!accessToken || !refreshToken) {
    throw new ShopeeApiError('Resposta de token da Shopee sem access_token/refresh_token — payload inesperado.', 'AUTH');
  }

  // NÃO CONFIRMADO (ver shopee.md, seção 1): se `expire_in` já vem pronto como timestamp ou é
  // segundos a somar ao horário da resposta — assumindo segundos aqui (padrão mais comum),
  // precisa validar contra uma resposta real antes de confiar neste cálculo.
  const expireInSeconds = Number(data.expire_in ?? 0);
  const now = Date.now();

  return {
    accessToken,
    refreshToken,
    accessTokenExpiresAt: new Date(now + expireInSeconds * 1000),
    // Validade do refresh_token citada como ~30 dias por mais de uma fonte, mas sem confirmação
    // forte — usa esse valor só como estimativa até a Shopee confirmar (ou não) um campo próprio.
    refreshTokenExpiresAt: new Date(now + 30 * 24 * 60 * 60 * 1000),
    shopId: data.shop_id ? String(data.shop_id) : undefined,
    merchantId: data.merchant_id ? String(data.merchant_id) : undefined,
  };
}
