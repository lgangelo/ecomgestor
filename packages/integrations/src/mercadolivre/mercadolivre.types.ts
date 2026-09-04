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
