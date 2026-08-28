import { TIKTOK_HOSTS, TIKTOK_PATHS, TikTokTokenResponse } from './tiktok.types';
import { TikTokApiError } from './tiktok.errors';

/**
 * OAuth da TikTok Shop (seção 2 da pesquisa / seção 6 do pedido) — apenas as funções puras de
 * construir a URL de autorização e trocar/renovar tokens. Estado (`state` do OAuth), lock de
 * refresh concorrente e persistência de credenciais são responsabilidade do backend
 * (apps/api/src/integrations/tiktok), não deste pacote — este arquivo não conhece Redis nem
 * banco de dados.
 */
export function buildAuthorizeUrl(appKey: string, state: string): string {
  const params = new URLSearchParams({ service_id: appKey, state });
  return `https://services.tiktokshop.com/open/authorize?${params.toString()}`;
}

export async function exchangeAuthorizationCode(
  appKey: string,
  appSecret: string,
  code: string,
): Promise<TikTokTokenResponse> {
  const url = new URL(`${TIKTOK_HOSTS.auth}${TIKTOK_PATHS.tokenExchange}`);
  url.searchParams.set('app_key', appKey);
  url.searchParams.set('app_secret', appSecret);
  url.searchParams.set('auth_code', code);
  url.searchParams.set('grant_type', 'authorized_code');
  return fetchAndParseToken(url);
}

export async function refreshAccessToken(
  appKey: string,
  appSecret: string,
  refreshToken: string,
): Promise<TikTokTokenResponse> {
  const url = new URL(`${TIKTOK_HOSTS.auth}${TIKTOK_PATHS.tokenRefresh}`);
  url.searchParams.set('app_key', appKey);
  url.searchParams.set('app_secret', appSecret);
  url.searchParams.set('refresh_token', refreshToken);
  url.searchParams.set('grant_type', 'refresh_token');
  return fetchAndParseToken(url);
}

async function fetchAndParseToken(url: URL): Promise<TikTokTokenResponse> {
  let response: Response;
  try {
    response = await fetch(url.toString());
  } catch (error) {
    throw new TikTokApiError(`Falha de rede na autenticação TikTok Shop: ${(error as Error).message}`, 'TEMPORARY');
  }

  const json: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      json && typeof json === 'object' && 'message' in json
        ? String((json as Record<string, unknown>).message)
        : `Erro HTTP ${response.status} ao obter token da TikTok Shop`;
    throw new TikTokApiError(message, response.status === 401 || response.status === 403 ? 'AUTH' : 'TEMPORARY', response.status);
  }

  return parseTokenResponse(json);
}

function parseTokenResponse(json: unknown): TikTokTokenResponse {
  const envelope = json as { data?: Record<string, unknown> } | null;
  const data = envelope?.data ?? {};

  const accessToken = data.access_token ? String(data.access_token) : '';
  const refreshToken = data.refresh_token ? String(data.refresh_token) : '';
  if (!accessToken || !refreshToken) {
    throw new TikTokApiError(
      'Resposta de token da TikTok Shop sem access_token/refresh_token — payload inesperado.',
      'PERMANENT',
    );
  }

  return {
    accessToken,
    refreshToken,
    accessTokenExpiresAt: new Date(Number(data.access_token_expire_in ?? 0) * 1000),
    refreshTokenExpiresAt: new Date(Number(data.refresh_token_expire_in ?? 0) * 1000),
    openId: data.open_id ? String(data.open_id) : '',
    sellerName: data.seller_name ? String(data.seller_name) : undefined,
    shopId: data.shop_id ? String(data.shop_id) : undefined,
  };
}
