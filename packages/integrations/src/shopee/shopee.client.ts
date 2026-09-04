import { signShopeeRequest } from './shopee.signer';
import { SHOPEE_HOSTS } from './shopee.types';
import { ShopeeApiError, ShopeeErrorCategory } from './shopee.errors';

export interface ShopeeClientConfig {
  partnerId: string;
  partnerKey: string;
  accessToken: string;
  shopId?: string;
  merchantId?: string;
  sandbox: boolean;
}

export type ShopeeHttpMethod = 'GET' | 'POST';

/**
 * Cliente HTTP de baixo nível para a Shopee Open API — assinatura e envelope de resposta
 * (mesmo papel de `tiktok.client.ts`). NENHUM método de negócio (produtos/pedidos/estoque) foi
 * implementado ainda de propósito: o formato exato de cada endpoint não foi confirmado contra
 * uma chamada real (ver docs/integrations/shopee.md, "Próximos passos") — este cliente só monta
 * a base (assinatura + envelope) para quando isso acontecer.
 *
 * Formato de envelope ASSUMIDO (não confirmado pela pesquisa em shopee.md, que não cobriu o
 * formato genérico de resposta — vem de conhecimento geral e comum a integrações Shopee v2):
 * `{ request_id, error, message, warning?, response: T }`. `error` não-vazio significa falha,
 * mesmo com HTTP 200 — precisa confirmar contra uma resposta real antes de virar premissa.
 */
export class ShopeeClient {
  constructor(private readonly config: ShopeeClientConfig) {}

  async request<T>(method: ShopeeHttpMethod, path: string, options: { query?: Record<string, string>; body?: unknown } = {}): Promise<T> {
    const timestamp = Math.floor(Date.now() / 1000);
    const sign = signShopeeRequest({
      partnerId: this.config.partnerId,
      partnerKey: this.config.partnerKey,
      path,
      timestamp,
      accessToken: this.config.accessToken,
      shopId: this.config.shopId,
      merchantId: this.config.merchantId,
    });

    const query: Record<string, string> = {
      partner_id: this.config.partnerId,
      timestamp: String(timestamp),
      sign,
      access_token: this.config.accessToken,
      ...(this.config.shopId ? { shop_id: this.config.shopId } : {}),
      ...(this.config.merchantId ? { merchant_id: this.config.merchantId } : {}),
      ...(options.query ?? {}),
    };

    const host = this.config.sandbox ? SHOPEE_HOSTS.sandbox : SHOPEE_HOSTS.production;
    const url = `${host}${path}?${new URLSearchParams(query).toString()}`;

    let response: Response;
    try {
      response = await fetch(url, {
        method,
        headers: { 'content-type': 'application/json' },
        body: method === 'GET' ? undefined : JSON.stringify(options.body ?? {}),
      });
    } catch (error) {
      throw new ShopeeApiError(`Falha de rede ao chamar a API da Shopee: ${(error as Error).message}`, 'TEMPORARY');
    }

    if (response.status === 429) {
      const retryAfter = Number(response.headers.get('retry-after') ?? '1');
      throw new ShopeeApiError('Rate limit excedido pela Shopee', 'RATE_LIMIT', 429, retryAfter);
    }

    const json: unknown = await response.json().catch(() => null);

    if (!response.ok) {
      throw this.classifyError(response.status, json);
    }

    const envelope = json as { error?: string; message?: string; response?: T } | null;
    if (envelope?.error && envelope.error.length > 0) {
      throw this.classifyError(response.status, json);
    }

    return (envelope?.response ?? (json as T)) as T;
  }

  private classifyError(status: number, json: unknown): ShopeeApiError {
    const envelope = json as { error?: string; message?: string } | null;
    const message = envelope?.message || envelope?.error || `Erro HTTP ${status} da API Shopee`;

    let category: ShopeeErrorCategory = 'PERMANENT';
    if (status === 401 || status === 403) category = 'AUTH';
    else if (status === 429) category = 'RATE_LIMIT';
    else if (status >= 500) category = 'TEMPORARY';
    else if (status === 400 || status === 422) category = 'VALIDATION';
    // Mesmo cuidado best-effort já confirmado necessário para a TikTok (ver tiktok.client.ts) —
    // nunca inventa um código de erro específico da Shopee, só evita classificar como PERMANENT
    // algo que claramente fala de token/autenticação.
    else if (/token/i.test(message)) category = 'AUTH';

    return new ShopeeApiError(message, category, status);
  }
}
