import {
  MERCADO_LIVRE_HOSTS,
  MercadoLivreCategoryAttribute,
  MercadoLivreCategoryPrediction,
  MercadoLivreCreateItemInput,
  MercadoLivreCreatedItem,
} from './mercadolivre.types';
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

  /** Único endpoint de negócio usado hoje pelo health check da integração, pra validar que o
   * token ainda funciona. */
  async getMe(): Promise<{ id: number; nickname?: string }> {
    return this.request('GET', '/users/me');
  }

  /** Tipos de publicação disponíveis pro site (ex.: MLB) — CONFIRMADO em produção que
   * `listing_type_id` é obrigatório no payload de `createItem` (a API recusa com
   * "body.required_fields" sem ele). Valores variam por site/conta (reputação, categoria) — nunca
   * hard-codar um id fixo, sempre consultar este endpoint antes de montar o payload. */
  async getListingTypes(siteId: string): Promise<Array<{ id: string; name: string }>> {
    return this.request('GET', `/sites/${siteId}/listing_types`);
  }

  /** Sugere a categoria mais provável a partir de um título de anúncio — primeiro passo antes de
   * publicar qualquer item: cada categoria tem sua própria ficha de atributos obrigatórios (ver
   * `getCategoryAttributes`), então descobrir a categoria certa vem sempre antes. `limit` (1-8,
   * confirmado pela doc) controla quantas sugestões voltam; a primeira é a de maior probabilidade. */
  async predictCategory(siteId: string, title: string, limit = 3): Promise<MercadoLivreCategoryPrediction[]> {
    return this.request('GET', `/sites/${siteId}/domain_discovery/search`, { query: { q: title, limit: String(limit) } });
  }

  /** Ficha de atributos de uma categoria — cada atributo vem marcado com `tags.required` quando
   * é obrigatório pra publicar nela; `value_type` e `values` (quando existem) dizem se é texto
   * livre, número, ou uma lista fechada de opções. */
  async getCategoryAttributes(categoryId: string): Promise<MercadoLivreCategoryAttribute[]> {
    return this.request('GET', `/categories/${categoryId}/attributes`);
  }

  /** Cria um anúncio novo — PÚBLICO assim que criado (nunca some criado como rascunho invisível
   * por padrão, salvo indicação em contrário da própria API). NÃO CONFIRMADO contra uma chamada
   * real ainda — primeira tentativa real deve vir de um script de diagnóstico, nunca de um botão
   * de UI direto, até confirmarmos o formato exato de erro/sucesso. */
  async createItem(input: MercadoLivreCreateItemInput): Promise<MercadoLivreCreatedItem> {
    return this.request('POST', '/items', { body: input });
  }

  /** Descrição é um recurso SEPARADO do item (confirmado pela pesquisa — mercado-livre.md,
   * seção 2) — precisa desta segunda chamada depois de criar o item, nunca um campo do payload
   * de criação. */
  async setItemDescription(itemId: string, plainText: string): Promise<void> {
    await this.request('POST', `/items/${itemId}/description`, { body: { plain_text: plainText } });
  }

  /** Detalhe completo de um item já criado — usado pra inspecionar o estado real antes/depois de
   * uma atualização (ex.: conferir os `id`s reais atribuídos às fotos depois de enviá-las). */
  async getItem(itemId: string): Promise<Record<string, unknown>> {
    return this.request('GET', `/items/${itemId}`);
  }

  /** Atualiza um item já existente (preço, estoque, fotos, variações, etc.) — NÃO CONFIRMADO
   * ainda contra uma chamada real com `variations`/`pictures` (ver docs/integrations/
   * mercado-livre.md); primeira tentativa deve vir de um script de diagnóstico. */
  async updateItem(itemId: string, input: Record<string, unknown>): Promise<Record<string, unknown>> {
    return this.request('PUT', `/items/${itemId}`, { body: input });
  }

  /** Busca pedidos por vendedor — NÃO CONFIRMADO contra uma chamada real com token válido (ver
   * docs/integrations/mercado-livre.md, seção 4: a tentativa real em 2026-09-04, a partir do
   * ambiente sandbox usado nesta sessão, foi bloqueada em toda chamada a `/orders/*` (e também
   * `/items/*`, `/users/me`, `/shipments/*`, `/sites/{site}/listing_types`) pelo edge do próprio
   * Mercado Livre — HTTP 403 `PA_UNAUTHORIZED_RESULT_FROM_POLICIES` ("blocked_by": "PolicyAgent"),
   * mesmo com um `Bearer` inválido, ou seja, o bloqueio acontece ANTES de validar o token (é uma
   * política de rede/IP do lado do Mercado Livre, não um erro de autenticação). `/categories/{id}`
   * (endpoint público sem auth) respondeu normalmente (200) da mesma máquina, então não é bloqueio
   * de rede geral — só endpoints que normalmente exigem sessão/token. Query params aqui
   * (`seller`, `limit`, `offset`, `order.status`) refletem só o que a pesquisa original supôs
   * (nunca confirmados contra uma resposta real) — retorno tipado como `Record<string, unknown>`
   * de propósito, pra nunca inventar um campo que não foi visto de verdade. Reexecutar
   * `apps/api/src/cli/check-mercadolivre-orders.ts` a partir de um ambiente sem esse bloqueio
   * (ex.: a própria VM de produção) é o próximo passo antes de tipar isto de verdade. */
  async searchOrders(query: Record<string, string>): Promise<Record<string, unknown>> {
    return this.request('GET', '/orders/search', { query });
  }

  /** Detalhe de um pedido — NÃO CONFIRMADO pelo mesmo motivo de `searchOrders` (bloqueio de rede
   * do lado do Mercado Livre nesta tentativa, ver comentário acima e docs/integrations/
   * mercado-livre.md seção 4). Nunca tipar `status`/`payments[]`/`sale_fee` sem antes ver um JSON
   * real — usar este método (ou `client.request` diretamente) a partir de um ambiente destravado
   * primeiro. */
  async getOrder(orderId: string): Promise<Record<string, unknown>> {
    return this.request('GET', `/orders/${orderId}`);
  }

  /** Detalhe de um envio (id vem de `order.shipping.id`) — NÃO CONFIRMADO pelo mesmo motivo acima;
   * path inferido pela pesquisa original (nunca confirmado em primeira mão). */
  async getShipment(shipmentId: string): Promise<Record<string, unknown>> {
    return this.request('GET', `/shipments/${shipmentId}`);
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

    // `rawResponse` guarda o corpo inteiro (inclui `cause`, quando a API detalha exatamente qual
    // atributo falhou) — essencial pra diagnosticar erro de validação numa API sem sandbox, onde
    // cada tentativa real é a única fonte de verdade sobre o formato esperado.
    return new MercadoLivreApiError(message, category, status, undefined, json);
  }
}
