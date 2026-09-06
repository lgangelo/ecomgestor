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
        // A TikTok Shop exige o access_token também (na verdade, principalmente) neste header —
        // confirmado contra o exemplo de cURL gerado pela própria "Ferramenta de teste de API"
        // do Partner Center. Mandar só na query string ("access_token=...") faz a API responder
        // "Invalid credentials. The 'x-tts-access-token' header is invalid.".
        headers: { 'content-type': 'application/json', 'x-tts-access-token': this.config.accessToken },
        body: method === 'GET' ? undefined : bodyStr,
      });
    } catch (error) {
      throw new TikTokApiError(
        `Falha de rede ao chamar a API da TikTok Shop: ${(error as Error).message}`,
        'TEMPORARY',
      );
    }

    return this.handleResponse<T>(response);
  }

  /** Upload de arquivo não-imagem (PDF ou vídeo) pra associar a um produto — "Upload Product
   * File" da Product API (`POST /product/202309/files/upload`), escopo `seller.product.basic`.
   * NÃO CONFIRMADO ainda contra uma chamada real nesta conta (achado só via documentação oficial
   * navegada pelo Partner Center) — primeiro uso deve vir de um script de diagnóstico, igual todo
   * o resto desta integração.
   *
   * Diferente de `request()`: o corpo é `multipart/form-data` (arquivo binário + nome), nunca
   * JSON. ACHADO (também não confirmado por uma chamada real): a assinatura de requests
   * multipart da TikTok Shop trata o corpo como string vazia na fórmula do HMAC — documentado
   * assim pela TikTok para outros endpoints de upload de arquivo da Open API; se a assinatura
   * falhar contra uma chamada real, é o primeiro lugar a revisar. Nunca define o header
   * `content-type` manualmente — o `fetch` precisa gerar o boundary do multipart sozinho a
   * partir do `FormData`, um header fixo quebraria isso.
   */
  async uploadProductFile(params: { buffer: Buffer; filename: string }): Promise<{ id?: string; url?: string; [key: string]: unknown }> {
    const path = '/product/202309/files/upload';
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const query: Record<string, string> = {
      app_key: this.config.appKey,
      timestamp,
      ...(this.config.shopCipher ? { shop_cipher: this.config.shopCipher } : {}),
    };
    const sign = signApiRequest({ path, query, body: '', appSecret: this.config.appSecret });
    const searchParams = new URLSearchParams({ ...query, sign, access_token: this.config.accessToken });
    const url = `${TIKTOK_HOSTS.api}${path}?${searchParams.toString()}`;

    const form = new FormData();
    form.append('data', new Blob([params.buffer]), params.filename);
    form.append('name', params.filename);

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: { 'x-tts-access-token': this.config.accessToken },
        body: form,
      });
    } catch (error) {
      throw new TikTokApiError(
        `Falha de rede ao chamar a API da TikTok Shop: ${(error as Error).message}`,
        'TEMPORARY',
      );
    }

    return this.handleResponse(response);
  }

  private async handleResponse<T>(response: Response): Promise<T> {
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
    // A TikTok pode devolver um erro de token (access_token inválido/expirado) com HTTP 200 e o
    // código de erro só dentro do envelope — `status` sozinho nunca detecta isso (fica
    // PERMANENT, que nunca aciona o aviso de reconectar). Sem uma lista confirmada dos códigos
    // numéricos de erro de auth da TikTok (não encontrados com certeza na pesquisa), reconhecer
    // pela palavra "token" na mensagem é um sinal best-effort — nunca inventa um código
    // específico, só evita classificar como PERMANENT algo que claramente fala de token.
    else if (/token/i.test(message)) category = 'AUTH';

    return new TikTokApiError(message, category, status);
  }
}
