import { createHash, randomBytes } from 'node:crypto';
import { MERCADO_LIVRE_HOSTS, MERCADO_LIVRE_PATHS, MercadoLivreTokenResponse } from './mercadolivre.types';
import { MercadoLivreApiError } from './mercadolivre.errors';

/**
 * PKCE (RFC 7636) — CONFIRMADO como exigido pela aplicação real criada pelo usuário no painel do
 * Mercado Livre (opção "PKCE necessário" marcada na tela de criação, seção "Fluxos OAuth"), não
 * uma suposição da pesquisa original. `code_verifier`: string aleatória (43-128 chars depois de
 * base64url); `code_challenge`: SHA-256 do verifier, também em base64url, method `S256` (nunca
 * `plain` — S256 é o método padrão e mais seguro, sem motivo pra usar o outro).
 */
export function generateMercadoLivrePkcePair(): { codeVerifier: string; codeChallenge: string } {
  const codeVerifier = base64UrlEncode(randomBytes(64));
  const codeChallenge = base64UrlEncode(createHash('sha256').update(codeVerifier).digest());
  return { codeVerifier, codeChallenge };
}

function base64UrlEncode(buffer: Buffer): string {
  return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * OAuth do Mercado Livre — só as funções puras de montar a URL de autorização e trocar/renovar
 * token. Estado do fluxo (`state`), lock de refresh concorrente e persistência de credenciais
 * continuam responsabilidade do backend (apps/api/src/integrations/mercadolivre) — mesmo desenho
 * de `shopee.auth.ts`/`tiktok.auth.ts`, este arquivo não conhece Redis nem banco de dados.
 *
 * Diferente da Shopee/TikTok: o Mercado Livre usa OAuth 2.0 "puro" (sem assinatura HMAC própria
 * das requisições) — o `client_secret` só entra na troca/renovação de token, nunca em cada
 * chamada de API subsequente (essas usam só `Authorization: Bearer <access_token>`, ver
 * `mercadolivre.client.ts`).
 */
export function buildMercadoLivreAuthorizeUrl(params: {
  clientId: string;
  redirectUri: string;
  state: string;
  codeChallenge: string;
}): string {
  const { clientId, redirectUri, state, codeChallenge } = params;
  const url = new URL(`${MERCADO_LIVRE_HOSTS.authorize}${MERCADO_LIVRE_PATHS.authorize}`);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', redirectUri);
  // Padrão OAuth2 (RFC 6749, seção 4.1.2): o authorization server deve devolver o MESMO `state`
  // no redirect do callback — diferente do que a pesquisa da Shopee deixou em aberto (não
  // confirmado se ela repassa), aqui é comportamento OAuth2 padrão, não uma peculiaridade do
  // Mercado Livre — usamos com mais confiança, mas ainda vale confirmar contra um teste real.
  url.searchParams.set('state', state);
  url.searchParams.set('code_challenge', codeChallenge);
  url.searchParams.set('code_challenge_method', 'S256');
  return url.toString();
}

export async function exchangeMercadoLivreAuthorizationCode(params: {
  clientId: string;
  clientSecret: string;
  code: string;
  redirectUri: string;
  /** O MESMO `code_verifier` (nunca o challenge) gerado por `generateMercadoLivrePkcePair` na
   * hora de montar a URL de autorização — precisa ser guardado (Redis, junto do `state`) entre
   * as duas pontas do fluxo, já que o code_verifier original nunca é exposto na URL. */
  codeVerifier: string;
}): Promise<MercadoLivreTokenResponse> {
  const { clientId, clientSecret, code, redirectUri, codeVerifier } = params;
  return fetchAndParseToken({
    grant_type: 'authorization_code',
    client_id: clientId,
    client_secret: clientSecret,
    code,
    redirect_uri: redirectUri,
    code_verifier: codeVerifier,
  });
}

export async function refreshMercadoLivreAccessToken(params: {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}): Promise<MercadoLivreTokenResponse> {
  const { clientId, clientSecret, refreshToken } = params;
  return fetchAndParseToken({
    grant_type: 'refresh_token',
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
  });
}

async function fetchAndParseToken(body: Record<string, string>): Promise<MercadoLivreTokenResponse> {
  const url = `${MERCADO_LIVRE_HOSTS.api}${MERCADO_LIVRE_PATHS.token}`;

  let response: Response;
  try {
    // NÃO CONFIRMADO (ver mercado-livre.md, seção 1): a doc oficial (citada em fonte secundária)
    // diz que os parâmetros vão no CORPO, não na query string — mas não especifica o
    // Content-Type exato. `application/x-www-form-urlencoded` é o padrão da RFC 6749 (OAuth2)
    // pra endpoints de token e o mais citado em exemplos de terceiros — precisa validar contra
    // uma chamada real antes de virar premissa definitiva (se a API rejeitar, tentar JSON).
    response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
      body: new URLSearchParams(body).toString(),
    });
  } catch (error) {
    throw new MercadoLivreApiError(`Falha de rede na autenticação Mercado Livre: ${(error as Error).message}`, 'TEMPORARY');
  }

  const json: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const envelope = json as { message?: string; error?: string } | null;
    const message = envelope?.message || envelope?.error || `Erro HTTP ${response.status} ao obter token do Mercado Livre`;
    throw new MercadoLivreApiError(message, response.status === 401 || response.status === 403 ? 'AUTH' : 'TEMPORARY', response.status);
  }

  const data = json as Record<string, unknown>;
  const accessToken = data.access_token ? String(data.access_token) : '';
  const refreshToken = data.refresh_token ? String(data.refresh_token) : '';
  const userId = data.user_id !== undefined ? String(data.user_id) : '';
  if (!accessToken || !refreshToken || !userId) {
    throw new MercadoLivreApiError(
      'Resposta de token do Mercado Livre sem access_token/refresh_token/user_id — payload inesperado.',
      'AUTH',
    );
  }

  // DIVERGÊNCIA NÃO RESOLVIDA (ver mercado-livre.md, seção 1): fontes citaram tanto 10800s (3h)
  // quanto "6 horas" pro mesmo exemplo de resposta — usamos sempre o `expires_in` DEVOLVIDO DE
  // VERDADE em cada resposta, nunca um valor fixo hard-codado.
  const expiresInSeconds = Number(data.expires_in ?? 0);

  return {
    userId,
    accessToken,
    refreshToken,
    accessTokenExpiresAt: new Date(Date.now() + expiresInSeconds * 1000),
  };
}
