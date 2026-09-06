import {
  MERCADO_LIVRE_HOSTS,
  MercadoLivreCategoryAttribute,
  MercadoLivreCategoryPrediction,
  MercadoLivreCreateItemInput,
  MercadoLivreCreatedItem,
  MercadoLivreOrder,
  MercadoLivreOrderSearchResult,
  MercadoLivreShipment,
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
   * de criação.
   *
   * ACHADO REAL: `POST` só funciona a PRIMEIRA vez que a descrição é definida — num item que já
   * tem descrição (ex.: reenviar depois de editar o texto, ou o ciclo de sincronização periódica
   * atualizando uma descrição que mudou), a API rejeita com
   * `"Item already has a description, use PUT instead"`. Tenta `POST` primeiro (funciona pra item
   * novo) e, só nesse erro específico, refaz a mesma chamada com `PUT` — nunca chuta qual método
   * usar de antemão, porque não temos guardado se a descrição já foi definida antes. */
  async setItemDescription(itemId: string, plainText: string): Promise<void> {
    try {
      await this.request('POST', `/items/${itemId}/description`, { body: { plain_text: plainText } });
    } catch (error) {
      if (error instanceof MercadoLivreApiError && /use PUT instead/i.test(error.message)) {
        await this.request('PUT', `/items/${itemId}/description`, { body: { plain_text: plainText } });
        return;
      }
      throw error;
    }
  }

  /** Detalhe completo de um item já criado — usado pra inspecionar o estado real antes/depois de
   * uma atualização (ex.: conferir os `id`s reais atribuídos às fotos depois de enviá-las). */
  async getItem(itemId: string): Promise<Record<string, unknown>> {
    return this.request('GET', `/items/${itemId}`);
  }

  /** Qualidade da publicação de um ITEM clássico (o que `createItem` sempre devolve, ex.:
   * `MLB7594543328`) — devolve `score`/`level` gerais mais uma lista de `buckets` (título,
   * imagens, ficha técnica, descrição, etc.), cada um com o próprio `status` e uma lista de
   * `variables` pendentes/completas. É o jeito oficial de descobrir, pro Mercado Livre, o que
   * está faltando pra melhorar a qualidade de um anúncio JÁ PUBLICADO, em vez de adivinhar a
   * partir da ficha de atributos da categoria. ACHADO REAL: existe um endpoint IRMÃO,
   * `getUserProductPerformance`, pro ID de agrupamento de família (`MLBU...`, visível na tela do
   * vendedor) — os dois caminhos são diferentes (`/item/` x `/user-product/`, singular), tentar o
   * ID errado no caminho errado devolve um 404 genérico do Mercado Livre, não um erro específico. */
  async getItemPerformance(itemId: string): Promise<Record<string, unknown>> {
    return this.request('GET', `/item/${itemId}/performance`);
  }

  /** Mesmo recurso de qualidade que `getItemPerformance`, mas pro ID de "user product" (família
   * de variações, prefixo `MLBU...` — visível na URL de edição do anúncio no site do vendedor,
   * nunca devolvido pelas nossas chamadas de `createItem`). Ver nota em `getItemPerformance`. */
  async getUserProductPerformance(userProductId: string): Promise<Record<string, unknown>> {
    return this.request('GET', `/user-product/${userProductId}/performance`);
  }

  /** Atualiza um item já existente (preço, estoque, fotos, variações, etc.) — NÃO CONFIRMADO
   * ainda contra uma chamada real com `variations`/`pictures` (ver docs/integrations/
   * mercado-livre.md); primeira tentativa deve vir de um script de diagnóstico. */
  async updateItem(itemId: string, input: Record<string, unknown>): Promise<Record<string, unknown>> {
    return this.request('PUT', `/items/${itemId}`, { body: input });
  }

  /** Busca pedidos por vendedor — CONFIRMADO contra uma chamada real em produção em 2026-09-05
   * (rodada a partir da VM, sem o bloqueio de política de rede que travou a tentativa anterior a
   * partir do sandbox usado durante a pesquisa — ver docs/integrations/mercado-livre.md, seção 4).
   * Parâmetros `seller`/`limit`/`offset` confirmados; `order.status` (filtro opcional) ainda não
   * foi exercitado numa chamada real. O tipo de retorno cobre só os campos vistos até agora —
   * qualquer campo novo que aparecer numa chamada futura deve ser adicionado a
   * `MercadoLivreOrder`/`MercadoLivreOrderSearchResult`, nunca inventado antes de aparecer. */
  async searchOrders(query: Record<string, string>): Promise<MercadoLivreOrderSearchResult> {
    return this.request('GET', '/orders/search', { query });
  }

  /** Detalhe de um pedido — CONFIRMADO contra uma chamada real em 2026-09-05 (ver comentário de
   * `searchOrders` e `MercadoLivreOrder`). Só um pedido (cancelado/estornado) foi visto até agora
   * — o enum completo de `status` segue incompleto, tratar valores fora dos já documentados em
   * `MercadoLivreOrder` como desconhecidos. */
  async getOrder(orderId: string): Promise<MercadoLivreOrder> {
    return this.request('GET', `/orders/${orderId}`);
  }

  /** Detalhe de um envio (id vem de `order.shipping.id`) — CONFIRMADO contra uma chamada real em
   * 2026-09-05 (ver `MercadoLivreShipment`); só o modo `"me2"` (Mercado Envios clássico) e status
   * `"cancelled"` foram vistos até agora — Full/Flex e outros status seguem sem confirmação. */
  async getShipment(shipmentId: string): Promise<MercadoLivreShipment> {
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
