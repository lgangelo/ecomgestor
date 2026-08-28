import { signApiRequest } from './tiktok.signer';
import { TIKTOK_HOSTS, TikTokEnvelope, isTikTokEnvelope } from './tiktok.types';
import { TikTokApiError, TikTokErrorCategory } from './tiktok.errors';

export interface TikTokClientConfig {
  appKey: string;
  appSecret: string;
  accessToken: string;
  shopCipher?: string;
}

export type HttpMethod = 'GET' | 'POST' | 'PUT';

/**
 * Cliente HTTP de baixo nível para a TikTok Shop Open API — autenticação e assinatura
 * (seção 3, responsabilidade "Client" do pedido). Não conhece formato de domínio interno;
 * quem normaliza a resposta é o `TikTokMapper`, nunca este arquivo.
 */
export class TikTokClient {
  constructor(private readonly config: TikTokClientConfig) {}

  async request<T>(
    method: HttpMethod,
    path: string,
    options: { query?: Record<string, string>; body?: unknown } = {},
  ): Promise<T> {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const query: Record<string, string> = {
      app_key: this.config.appKey,
      timestamp,
      ...(this.config.shopCipher ? { shop_cipher: this.config.shopCipher } : {}),
      ...(options.query ?? {}),
    };
    const bodyStr = options.body !== undefined ? JSON.stringify(options.body) : '';
    const sign = signApiRequest({ path, query, body: bodyStr, appSecret: this.config.appSecret });

    const searchParams = new URLSearchParams({ ...query, sign, access_token: this.config.accessToken });
    const url = `${TIKTOK_HOSTS.api}${path}?${searchParams.toString()}`;

    let response: Response;
    try {
      response = await fetch(url, {
        method,
        headers: { 'content-type': 'application/json' },
        body: method === 'GET' ? undefined : bodyStr,
      });
    } catch (error) {
      throw new TikTokApiError(
        `Falha de rede ao chamar a API da TikTok Shop: ${(error as Error).message}`,
        'TEMPORARY',
      );
    }

    if (response.status === 429) {
      const retryAfter = Number(response.headers.get('retry-after') ?? '1');
      throw new TikTokApiError('Rate limit excedido pela TikTok Shop', 'RATE_LIMIT', 429, retryAfter);
    }

    const json: unknown = await response.json().catch(() => null);

    if (!response.ok) {
      throw this.classifyError(response.status, json);
    }

    if (isTikTokEnvelope(json)) {
      const envelope = json as TikTokEnvelope<T>;
      if (envelope.code !== 0) {
        throw this.classifyError(response.status, envelope);
      }
      return envelope.data;
    }

    return json as T;
  }

  private classifyError(status: number, json: unknown): TikTokApiError {
    const message =
      json && typeof json === 'object' && 'message' in json
        ? String((json as Record<string, unknown>).message)
        : `Erro HTTP ${status} da API TikTok Shop`;

    let category: TikTokErrorCategory = 'PERMANENT';
    if (status === 401 || status === 403) category = 'AUTH';
    else if (status === 429) category = 'RATE_LIMIT';
    else if (status >= 500) category = 'TEMPORARY';
    else if (status === 400 || status === 422) category = 'VALIDATION';

    return new TikTokApiError(message, category, status);
  }
}
