import { MERCADO_LIVRE_HOSTS } from './mercadolivre.types';
import { MercadoLivreApiError, MercadoLivreErrorCategory } from './mercadolivre.errors';

export interface MercadoLivreClientConfig {
  accessToken: string;
}

export type MercadoLivreHttpMethod = 'GET' | 'POST' | 'PUT';

/**
 * Cliente HTTP de baixo nível pro Mercado Livre — bem mais simples que o da Shopee/TikTok
 * porque não há assinatura própria (só `Authorization: Bearer <access_token>`). NENHUM método
 * de negócio (itens/pedidos/estoque) foi implementado ainda de propósito: os formatos exatos de
 * payload não foram confirmados contra uma chamada real (ver docs/integrations/mercado-livre.md,
 * "Próximos passos") — este cliente só monta a base (autenticação + classificação de erro) para
 * quando isso acontecer.
 */
export class MercadoLivreClient {
  constructor(private readonly config: MercadoLivreClientConfig) {}

  async request<T>(method: MercadoLivreHttpMethod, path: string, options: { query?: Record<string, string>; body?: unknown } = {}): Promise<T> {
    const query = new URLSearchParams(options.query ?? {}).toString();
    const url = `${MERCADO_LIVRE_HOSTS.api}${path}${query ? `?${query}` : ''}`;

    let response: Response;
    try {
      response = await fetch(url, {
        method,
        headers: {
          authorization: `Bearer ${this.config.accessToken}`,
          'content-type': 'application/json',
        },
        body: method === 'GET' ? undefined : JSON.stringify(options.body ?? {}),
      });
    } catch (error) {
      throw new MercadoLivreApiError(`Falha de rede ao chamar a API do Mercado Livre: ${(error as Error).message}`, 'TEMPORARY');
    }

    if (response.status === 429) {
      const retryAfter = Number(response.headers.get('retry-after') ?? '1');
      throw new MercadoLivreApiError('Rate limit excedido pelo Mercado Livre', 'RATE_LIMIT', 429, retryAfter);
    }

    const json: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      throw this.classifyError(response.status, json);
    }
    return json as T;
  }

  /** Único endpoint de negócio CONFIRMADO pela pesquisa (mercado-livre.md) além do próprio OAuth
   * — usado hoje só pelo health check da integração, pra validar que o token ainda funciona. */
  async getMe(): Promise<{ id: number; nickname?: string }> {
    return this.request('GET', '/users/me');
  }

  private classifyError(status: number, json: unknown): MercadoLivreApiError {
    const envelope = json as { message?: string; error?: string } | null;
    const message = envelope?.message || envelope?.error || `Erro HTTP ${status} da API Mercado Livre`;

    let category: MercadoLivreErrorCategory = 'PERMANENT';
    if (status === 401 || status === 403) category = 'AUTH';
    else if (status === 429) category = 'RATE_LIMIT';
    else if (status >= 500) category = 'TEMPORARY';
    else if (status === 400 || status === 422) category = 'VALIDATION';
    else if (/token/i.test(message)) category = 'AUTH';

    return new MercadoLivreApiError(message, category, status);
  }
}
