/**
 * Hosts e paths do Mercado Livre/Mercado Libre. Confirmados via fontes secundárias (SDKs de
 * terceiros, guias, trechos citados da doc oficial em resultados de busca) — o fetch direto de
 * `developers.mercadolivre.com.br` foi recusado (HTTP 403) durante a pesquisa, então NADA aqui
 * foi lido em primeira mão contra a documentação oficial (ver docs/integrations/mercado-livre.md
 * para as fontes e o nível de confiança de cada valor). Confirmar contra uma aplicação real +
 * usuários de teste antes de qualquer chamada de negócio — ver "Próximos passos" no mesmo doc.
 *
 * Diferente da Shopee: o Mercado Livre NÃO tem um host de sandbox separado — não existe
 * ambiente de teste isolado, só "usuários de teste" operando na própria produção (seção 9 do
 * doc de pesquisa). Por isso não há um campo `sandbox` aqui.
 */
export const MERCADO_LIVRE_HOSTS = {
  /** Host de autorização é BRASIL-específico (mostra a tela de login) — diferente do host da
   * API em si, que é sempre o mesmo (`api.mercadolibre.com`) independente do país do vendedor. */
  authorize: 'https://auth.mercadolivre.com.br',
  /** Host da API (troca/renovação de token e todas as chamadas autenticadas) — sempre
   * `.com`, mesmo para o site Brasil (MLB). */
  api: 'https://api.mercadolibre.com',
} as const;

export const MERCADO_LIVRE_PATHS = {
  authorize: '/authorization',
  /** Troca de code por token E renovação usam o MESMO endpoint, diferenciados só pelo
   * `grant_type` no corpo — confirmado por múltiplas fontes secundárias. */
  token: '/oauth/token',
} as const;

export interface MercadoLivreCredentials {
  /** Identificador do vendedor no Mercado Livre — chave de correlação por conta (não existe um
   * "shop_id" separado como na Shopee/TikTok, é este mesmo `user_id`). */
  userId: string;
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: Date;
  /** NÃO CONFIRMADO (ver mercado-livre.md, seção 1): nenhuma fonte consultada trouxe a validade
   * do refresh_token — sem um valor real pra usar, fica indefinido até confirmar contra uma
   * resposta real (nunca inventamos um número aqui). */
  refreshTokenExpiresAt?: Date;
}

export interface MercadoLivreTokenResponse {
  userId: string;
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: Date;
}

/** Resposta de `GET /sites/{site}/domain_discovery/search?q=...` — CONFIRMADO via resultado de
 * busca citando o formato oficial (campos domain_id/domain_name/category_id/category_name). */
export interface MercadoLivreCategoryPrediction {
  domain_id?: string;
  domain_name?: string;
  category_id: string;
  category_name: string;
}

/** Um valor possível de um atributo de categoria com lista fechada de opções (ex.: "Material":
 * Couro/Sintético/Nylon...). */
export interface MercadoLivreAttributeValue {
  id: string;
  name: string;
}

/** Um atributo da ficha técnica de uma categoria (`GET /categories/{id}/attributes`) —
 * CONFIRMADO via resultado de busca citando a tag `required` dentro de `tags`. */
export interface MercadoLivreCategoryAttribute {
  id: string;
  name: string;
  value_type?: string;
  tags?: { required?: boolean; fixed?: boolean; hidden?: boolean; [key: string]: boolean | undefined };
  values?: MercadoLivreAttributeValue[];
}

/** Valor de atributo enviado na criação de item — `value_id` quando o valor vem da lista fechada
 * da categoria (ver `MercadoLivreCategoryAttribute.values`), `value_name` como texto livre pros
 * atributos que aceitam (ex.: MODEL). NÃO CONFIRMADO se todo atributo com lista fechada aceita
 * `value_name` como alternativa (varia por categoria) — usar `value_id` sempre que houver um
 * valor de catálogo correspondente, só cair pra `value_name` quando não houver.
 */
export interface MercadoLivreItemAttributeInput {
  id: string;
  value_id?: string;
  value_name?: string;
}

/** Payload de `POST /items` — a maioria dos campos foi CONFIRMADA contra uma chamada real em
 * produção (ver docs/integrations/mercado-livre.md). `listing_type_id` é opcional no TIPO (a
 * API aceita omitir), mas CONFIRMADO como obrigatório NA PRÁTICA: sem ele, a API recusa com
 * HTTP 400 "body.required_fields" pedindo `listing_type_id` ou `family_name` — sempre resolver
 * via `getListingTypes` antes de montar o payload, nunca hard-codar um id fixo (varia por
 * site/conta). */
export interface MercadoLivreCreateItemInput {
  /** CONFIRMADO em produção: NUNCA enviar `title` junto com `family_name` — API recusa com
   * "body.invalid_fields" ("The fields [title] are invalid for requested call"). No modelo
   * "User Products", o Mercado Livre gera o título sozinho a partir do domínio/atributos/
   * family_name — `title` só se aplica a item SEM family_name (fora do modelo novo). */
  title?: string;
  category_id: string;
  price: number;
  currency_id: string;
  available_quantity: number;
  buying_mode: 'buy_it_now';
  condition: 'new' | 'used';
  listing_type_id?: string;
  /** CONFIRMADO obrigatório em produção (mesmo erro "body.required_fields", só some depois de
   * incluir isso) — nome genérico que agrupa variações do mesmo produto sob o modelo "User
   * Products"/"Preço por variação" do Mercado Livre. NÃO CONFIRMADO qual granularidade exata
   * esperada (nome do produto sem cor/tamanho? nome completo?) — usamos o nome do produto como
   * primeira tentativa. */
  family_name?: string;
  pictures: Array<{ source: string }>;
  attributes: MercadoLivreItemAttributeInput[];
}

export interface MercadoLivreCreatedItem {
  id: string;
  permalink?: string;
  status?: string;
}

/** Item de `order_items[]` — CONFIRMADO contra uma chamada real em 2026-09-05 (a partir da VM de
 * produção, ver docs/integrations/mercado-livre.md seção 4). Campos abaixo são exatamente os que
 * vieram na resposta real; qualquer campo novo visto numa chamada futura deve ser adicionado aqui
 * (nunca inventado antes de aparecer de verdade). */
export interface MercadoLivreOrderItem {
  item: {
    id: string;
    title: string;
    category_id: string;
    variation_id: number | null;
    seller_custom_field: string | null;
    variation_attributes?: Array<{ name: string; id: string; value_id: string; value_name: string }>;
    warranty: string | null;
    condition: string;
    /** CONFIRMADO presente, mas o valor visto (`"MLB6717678206_201389264747"`, formato
     * `{item_id}_{variation_id}`) NÃO bateu com o SKU interno enviado como atributo `SELLER_SKU`
     * na criação do item — precisa investigar se o Mercado Livre sobrescreve este campo com um
     * valor próprio no modelo "User Products"/`family_name` (cada cor é um item separado), ou se
     * é outra coisa. NUNCA usar este campo pra casar com `ProductVariant.sku` sem confirmar isso
     * primeiro. */
    seller_sku?: string;
    global_price: number | null;
    net_weight: number | null;
    user_product_id?: string;
  };
  quantity: number;
  requested_quantity?: { measure: string; value: number };
  picked_quantity: number | null;
  unit_price: number;
  gross_price?: number;
  currency_id: string;
  manufacturing_days: number | null;
  /** Comissão do Mercado Livre já calculada para este item (valor em `currency_id`, não
   * percentual) — CONFIRMADO que mora AQUI, em cada item, e não dentro de `payments[]` como a
   * pesquisa original (antes de qualquer chamada real) tinha suposto. Ver correção na seção 4 do
   * doc. */
  sale_fee: number;
  listing_type_id: string;
}

/** `GET /orders/{id}` — CONFIRMADO contra uma chamada real em 2026-09-05. Só o único pedido
 * existente na conta até agora (cancelado/estornado) foi visto — o enum completo de `status`
 * segue sem confirmação total (só o valor `"cancelled"` foi observado de verdade); tratar
 * qualquer valor fora dos já vistos aqui como desconhecido, nunca assumir o resto da lista
 * hipotética antiga (`paid`/`confirmed`/etc.) até aparecer numa resposta real. */
export interface MercadoLivreOrder {
  id: number;
  date_created: string;
  last_updated: string;
  date_closed: string | null;
  pack_id: number | null;
  fulfilled: boolean;
  buying_mode: string;
  total_amount: number;
  paid_amount: number;
  order_items: MercadoLivreOrderItem[];
  currency_id: string;
  payments: Array<{
    id: number;
    order_id: number;
    payer_id: number;
    collector: { id: number };
    payment_method_id: string;
    payment_type: string;
    status: string;
    status_detail: string | null;
    transaction_amount: number;
    transaction_amount_refunded: number;
    taxes_amount: number;
    total_paid_amount: number;
    /** CONFIRMADO presente, mas veio `0` no único pagamento visto até agora (pedido cancelado) —
     * NÃO CONFIRMADO ainda qual valor real aparece num pagamento aprovado/liquidado. Não confundir
     * com `order_items[].sale_fee`, que é o campo que de fato trouxe um valor não-zero. */
    marketplace_fee: number;
    date_approved: string | null;
    date_created: string;
    date_last_modified: string;
  }>;
  shipping: { id: number } | null;
  /** CONFIRMADO: só o valor `"cancelled"` visto até agora. */
  status: string;
  status_detail: string | null;
  tags: string[];
  static_tags?: string[];
  cancel_detail?: {
    group: string;
    code: string;
    description: string;
    requested_by: string;
    date: string;
    application_id: string;
  } | null;
  context: { channel: string; site: string; flows: unknown[] };
  buyer: { id: number; nickname?: string; first_name?: string; last_name?: string };
  seller: { id: number; nickname?: string };
  taxes: { amount: number | null; currency_id: string | null; id: string | null };
}

/** `GET /orders/search` — CONFIRMADO contra uma chamada real em 2026-09-05. */
export interface MercadoLivreOrderSearchResult {
  results: MercadoLivreOrder[];
  paging: { total: number; offset: number; limit: number };
}

/** `GET /shipments/{id}` — CONFIRMADO contra uma chamada real em 2026-09-05 (site MLB, envio
 * cancelado). Campos de endereço/custo/prazo NÃO estão todos listados aqui — só os já usados ou
 * mais relevantes pro nosso lado; o restante do payload real tem muito mais campos (ver o JSON
 * completo salvo na sessão que rodou o script, ou rodar `check-mercadolivre-orders` de novo). */
export interface MercadoLivreShipment {
  id: number;
  order_id: number;
  /** CONFIRMADO valor real `"me2"` (Mercado Envios 2/clássico) no único envio visto — os outros
   * modos (Full/Flex, ver seção 5 do doc) ainda não foram confirmados por uma chamada real. */
  mode: string;
  /** CONFIRMADO: só o valor `"cancelled"` visto até agora (mesmo pedido cancelado acima). */
  status: string;
  substatus: string | null;
  logistic_type?: string;
  tracking_number: string | null;
  tracking_method?: string | null;
  date_created: string;
  last_updated: string;
}
