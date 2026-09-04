import { MERCADO_LIVRE_HOSTS, MERCADO_LIVRE_PATHS, MercadoLivreTokenResponse } from './mercadolivre.types';
import { MercadoLivreApiError } from './mercadolivre.errors';

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
export function buildMercadoLivreAuthorizeUrl(params: { clientId: string; redirectUri: string; state: string }): string {
  const { clientId, redirectUri, state } = params;
  const url = new URL(`${MERCADO_LIVRE_HOSTS.authorize}${MERCADO_LIVRE_PATHS.authorize}`);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', redirectUri);
  // Padrão OAuth2 (RFC 6749, seção 4.1.2): o authorization server deve devolver o MESMO `state`
  // no redirect do callback — diferente do que a pesquisa da Shopee deixou em aberto (não
  // confirmado se ela repassa), aqui é comportamento OAuth2 padrão, não uma peculiaridade do
  // Mercado Livre — usamos com mais confiança, mas ainda vale confirmar contra um teste real.
  url.searchParams.set('state', state);
  return url.toString();
}

export async function exchangeMercadoLivreAuthorizationCode(params: {
  clientId: string;
  clientSecret: string;
  code: string;
  redirectUri: string;
}): Promise<MercadoLivreTokenResponse> {
  const { clientId, clientSecret, code, redirectUri } = params;
  return fetchAndParseToken({
    grant_type: 'authorization_code',
    client_id: clientId,
    client_secret: clientSecret,
    code,
    redirect_uri: redirectUri,
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
