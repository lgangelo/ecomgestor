import { TIKTOK_HOSTS, TIKTOK_PATHS, TikTokEnvelope, TikTokTokenResponse, isTikTokEnvelope } from './tiktok.types';
import { TikTokApiError } from './tiktok.errors';

/**
 * OAuth da TikTok Shop (seção 2 da pesquisa / seção 6 do pedido) — apenas as funções puras de
 * construir a URL de autorização e trocar/renovar tokens. Estado (`state` do OAuth), lock de
 * refresh concorrente e persistência de credenciais são responsabilidade do backend
 * (apps/api/src/integrations/tiktok), não deste pacote — este arquivo não conhece Redis nem
 * banco de dados.
 */
/**
 * `serviceId` NÃO é o App Key — é um identificador separado, exibido logo abaixo do nome do
 * app na página "App & Service" do Partner Center. Usar o App Key aqui faz a TikTok responder
 * "This service does not exist" na tela de autorização, mesmo com um App Key válido (ele
 * funciona normalmente nas chamadas de API, só não serve como service_id).
 */
export function buildAuthorizeUrl(serviceId: string, state: string): string {
  const params = new URLSearchParams({ service_id: serviceId, state });
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

  // A TikTok pode devolver um erro de token (refresh token expirado/revogado, code inválido...)
  // com HTTP 200 e o erro só dentro do envelope (confirmado que isso acontece nas chamadas de
  // negócio normais, ver TikTokClient.request — nunca foi checado aqui, no endpoint de TOKEN em
  // si). Diferente de uma chamada de negócio comum (onde um erro pode ser validação, rate limit
  // etc.), QUALQUER erro devolvido pelo endpoint de token — por HTTP não-200 ou por code != 0
  // dentro de um HTTP 200 — significa por definição que o fluxo de autenticação está quebrado
  // (token/código inválido, expirado ou revogado), nunca "temporário" nem "permanente
  // genérico". Classificar como 'AUTH' é o que faz `tiktok-token-refresh.service.ts` marcar a
  // integração como AUTH_EXPIRED e avisar "reconecte sua loja" — sem isso, o erro cai como
  // PERMANENT e a integração nunca avisa ninguém, só falha silenciosamente pra sempre.
  if (isTikTokEnvelope(json) && json.code !== 0) {
    throw new TikTokApiError(
      (json as TikTokEnvelope<unknown>).message || 'Erro de autenticação retornado pela TikTok Shop',
      'AUTH',
    );
  }

  return parseTokenResponse(json);
}

function parseTokenResponse(json: unknown): TikTokTokenResponse {
  const envelope = json as { data?: Record<string, unknown> } | null;
  const data = envelope?.data ?? {};

  const accessToken = data.access_token ? String(data.access_token) : '';
  const refreshToken = data.refresh_token ? String(data.refresh_token) : '';
  if (!accessToken || !refreshToken) {
    // Sem código de erro no envelope (code === 0 ou ausente) mas também sem token utilizável —
    // ainda assim é uma falha do fluxo de autenticação, nunca um erro "permanente genérico"
    // (categoria que nunca aciona o aviso de reconectar).
    throw new TikTokApiError(
      'Resposta de token da TikTok Shop sem access_token/refresh_token — payload inesperado.',
      'AUTH',
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
