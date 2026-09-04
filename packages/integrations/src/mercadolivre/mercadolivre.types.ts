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
