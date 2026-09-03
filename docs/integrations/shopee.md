# Shopee Open Platform — pesquisa para preparar uma futura integração

**Status: pesquisa concluída em 2026-09-02, sem código.** Este documento mapeia a Shopee Open
API (também chamada "Shopee Open Platform", documentada oficialmente em `open.shopee.com`) no
mesmo formato usado para a TikTok Shop (`docs/integrations/tiktok.md` e
`docs/integrations/tiktok-data-mapping.md`), para servir de ponto de partida a uma sessão futura
de implementação. Nenhuma linha de código de conector foi escrita nesta pesquisa.

## Fontes consultadas

- [congminh1254/shopee-sdk — docs/managers/auth.md](https://github.com/congminh1254/shopee-sdk/blob/main/docs/managers/auth.md)
- [congminh1254/shopee-sdk — docs/managers/order.md](https://github.com/congminh1254/shopee-sdk/blob/main/docs/managers/order.md)
- [congminh1254/shopee-sdk — docs/managers/product.md](https://github.com/congminh1254/shopee-sdk/blob/main/docs/managers/product.md)
- [congminh1254/shopee-sdk — docs/managers/payment.md](https://github.com/congminh1254/shopee-sdk/blob/main/docs/managers/payment.md)
- [congminh1254/shopee-sdk — docs/managers/returns.md](https://github.com/congminh1254/shopee-sdk/blob/main/docs/managers/returns.md)
- [congminh1254/shopee-sdk — docs/managers/push.md](https://github.com/congminh1254/shopee-sdk/blob/main/docs/managers/push.md)
- [congminh1254/shopee-sdk — docs/managers/logistics.md](https://github.com/congminh1254/shopee-sdk/blob/main/docs/managers/logistics.md)
- [congminh1254/shopee-sdk — docs/managers/public.md](https://github.com/congminh1254/shopee-sdk/blob/main/docs/managers/public.md)
- [congminh1254/shopee-sdk — docs/managers/shop.md](https://github.com/congminh1254/shopee-sdk/blob/main/docs/managers/shop.md)
- [douglara/shopee-api (Ruby gem, README)](https://github.com/douglara/shopee-api/blob/main/README.md)
- [singaporeapi.com — Shopee Open Platform: endpoints, auth & code examples](https://singaporeapi.com/apis/shopee-open-platform)
- [publicapis.io — Shopee API: Open Platform Key Setup, Auth & Endpoints Guide](https://publicapis.io/shopee-api)
- [Rollout — Shopee API Essentials](https://rollout.com/integration-guides/shopee/api-essentials)
- [Rollout — How to build a public Shopee integration: Building the Auth Flow](https://rollout.com/integration-guides/shopee/how-to-build-a-public-shopee-integration-building-the-auth-flow)
- [Rollout — Step-by-step guide to building a Shopee API integration](https://rollout.com/integration-guides/shopee/sdk/step-by-step-guide-to-building-a-shopee-api-integration-in-python)
- [automationnocode.com — Guidelines for Creating Sign and Retrieving Access Token for Shopee API](https://automationnocode.com/guidelines-for-creating-sign-and-retrieving-access-token-for-shopee-api/)
- [api2cart.com — Shopee API Guide: Open Platform, Seller API, Auth & Docs](https://api2cart.com/api-technology/shopee-api/)
- [fiscalpro.com.br — Shopee e NF-e: emitir no Fiscal Pro e enviar o XML manualmente](https://fiscalpro.com.br/ajuda/doc/28)
- [suporteanymarket.freshdesk.com — Shopee torna obrigatório o envio do XML da Nota Fiscal](https://suporteanymarket.freshdesk.com/pt-BR/support/solutions/articles/19000148599-shopee-torna-obrigat%C3%B3rio-o-envio-do-xml-da-nota-fiscal-para-faturamento-de-pedidos)

## Limitação importante e honesta

Diferente da pesquisa da TikTok Shop (onde o Partner Center é uma SPA que bloqueou parte do fetch
automatizado, mas pelo menos foi possível carregar algumas páginas), aqui **o fetch direto de
`open.shopee.com` foi recusado pela própria ferramenta de navegação** ("Claude Code is unable to
fetch from open.shopee.com") em todas as tentativas. Nenhuma página da documentação oficial da
Shopee foi lida diretamente nesta pesquisa.

Em vez disso, a pesquisa se apoiou em:

1. **SDKs de terceiros que documentam os endpoints com a nomenclatura oficial da Shopee**
   (`v2.<módulo>.<ação>`, ex.: `v2.order.get_order_list`) — em especial o repositório
   `congminh1254/shopee-sdk`, que tem um `docs/managers/*.md` por módulo, aparentemente gerado a
   partir da doc oficial (a nomenclatura bate com o padrão público conhecido da Shopee Open API
   v2 e é consistente entre módulos).
2. **Agregadores/guias de terceiros** (singaporeapi.com, publicapis.io, rollout.com,
   api2cart.com) para cruzar informação de autenticação, assinatura e rate limit.
3. **Fontes brasileiras de ERPs/fiscais** (fiscalpro.com.br, anymarket) para a parte de NF-e.

Isso significa que **nenhum path de endpoint abaixo foi confirmado contra a documentação oficial
em primeira mão** — todos vêm de fontes secundárias, ainda que consistentes entre si na maioria
dos casos. Onde as fontes **discordaram** entre si (rate limit, formato exato do header de
assinatura de webhook, lista completa de `order_status`), isso é reportado explicitamente como
divergência, não resolvido por adivinhação. Nada abaixo foi inventado: todo endpoint, parâmetro e
nome de campo citado apareceu em pelo menos uma fonte listada acima.

## 1. Autenticação

**Modelo confirmado (múltiplas fontes concordam):** a Shopee usa um modelo de **Partner** — o
desenvolvedor se registra no Open Platform (`open.shopee.com`), cria um app e recebe um
**`partner_id`** (numérico) e um **`partner_key`** (secreto). Diferente da TikTok Shop (que tem
"Custom App" para uso interno de um único seller sem revisão pública), as fontes consultadas não
deixam claro se a Shopee oferece uma categoria equivalente de app de uso interno sem processo de
aprovação — **não confirmado, precisa validar no Open Platform real**. O que é citado
repetidamente é a existência de um **host de sandbox estável e público**,
`https://partner.test-stable.shopeemobile.com`, ao lado do host de produção
`https://partner.shopeemobile.com` — isso é uma diferença notável em relação à TikTok Shop, cuja
pesquisa não encontrou host de sandbox público equivalente.

**Fluxo OAuth (confirmado, consistente entre fontes):**

```text
1. Nossa app monta uma URL de autorização (host partner.shopeemobile.com) contendo partner_id,
   redirect (nossa redirect_uri), timestamp e sign (calculado sobre o path de autorização —
   ver "Assinatura" abaixo).
2. Seller acessa essa URL, loga na conta Shopee (Seller Center) e aprova o acesso.
3. Shopee redireciona para a redirect_uri configurada, com um `code` de autorização e um
   `shop_id` (loja individual) — cenários "conta principal" (main account / merchant, usado por
   sellers com múltiplas lojas, comum em alguns mercados) trazem `main_account_id` em vez de, ou
   junto de, `shop_id`.
4. Nossa aplicação troca o `code` por tokens via chamada servidor-a-servidor.
```

- **Host de auth/token:** `https://partner.shopeemobile.com` (produção) /
  `https://partner.test-stable.shopeemobile.com` (sandbox) — confirmado via múltiplas fontes.
- **Troca de código por token:** `POST /api/v2/auth/token/get` — path citado por mais de uma
  fonte independente.
- **Refresh de token:** `POST /api/v2/auth/access_token/get` — mesmo nível de confiança.
- **Resposta de token (campos citados nas fontes):** `access_token`, `refresh_token`,
  `expire_in` (segundos, valor citado como **14400 = 4 horas**), além de identificadores de loja
  (`shop_id`) ou de conta principal (`merchant_id`). Uma fonte também menciona um `expired_at`
  (timestamp) calculado pelo próprio SDK — **não confirmado se a API da Shopee devolve esse
  timestamp pronto ou se é o cliente quem soma `expire_in` ao horário da resposta**; a TikTok, por
  comparação, devolve o timestamp pronto — vale essa mesma checagem para a Shopee antes de decidir
  como persistir a expiração.
- **Validade do `access_token`:** **4 horas** — citado por múltiplas fontes de forma consistente
  (bem mais curto que o `access_token` da TikTok, que dura 7 dias — implica um scheduler de
  refresh bem mais frequente).
- **Validade do `refresh_token`:** citado como **~1 mês (30 dias)** por mais de uma fonte, mas com
  menos consistência que os 4h do access_token — **tratar como não confirmado com certeza total**;
  se expirar, o seller precisa reautorizar do zero (gerar novo `code`).
- **Escopo por loja:** confirmado — access_token/refresh_token são por `shop_id` (ou por
  `merchant_id`), nunca globais para o partner; múltiplas lojas do mesmo seller exigem tokens
  separados, mesma lógica que a TikTok já usa (`shop_cipher` por loja).

### Assinatura das requisições (HMAC-SHA256)

**Confirmado por múltiplas fontes independentes, convergindo na mesma fórmula geral** — mais
simples que a da TikTok (que assina path + query ordenada + corpo):

```text
base_string = partner_id + path + timestamp [+ access_token] [+ shop_id ou merchant_id]
sign = hex( HMAC_SHA256( key = partner_key, message = base_string ) )
```

- `path` é o path da API (ex.: `/api/v2/order/get_order_list`), **sem** query string nem corpo —
  diferente da TikTok, que inclui query ordenada e corpo no cálculo.
- O `sign` resultante, junto com `partner_id` e `timestamp`, vai **na query string** da
  requisição — mesmo em chamadas `POST` (o corpo JSON carrega só os parâmetros de negócio, não os
  de autenticação). Isso bate com o padrão relatado por várias fontes.
- **Três variações da base string, dependendo do tipo de endpoint** (relatado de forma consistente
  por mais de uma fonte, mas nunca verificado contra uma chamada real):
  1. **Endpoints públicos** (antes de existir token, ex.: gerar a URL de autorização, trocar
     `code` por token): `partner_id + path + timestamp`.
  2. **Endpoints de loja** (a maioria das chamadas de negócio — pedidos, produtos, estoque):
     `partner_id + path + timestamp + access_token + shop_id`.
  3. **Endpoints de conta principal / merchant** (contas com múltiplas lojas):
     `partner_id + path + timestamp + access_token + merchant_id`.
- **Não confirmado**: se o `access_token` também precisa ir em algum header HTTP adicional (a
  TikTok exige `x-tts-access-token` além da query). Nenhuma fonte consultada mencionou um header
  equivalente para a Shopee — a leitura atual é que o `access_token` só entra na query e na base
  string da assinatura, mas isso precisa ser validado com uma chamada real antes de se tornar
  premissa de implementação.

## 2. Orders API

**Confirmado (via `docs/managers/order.md` do SDK de terceiros, nomenclatura oficial
`v2.order.*`):**

- **Listar pedidos:** `v2.order.get_order_list` — paginação por cursor (`page_size` máx. 100,
  `cursor`, resposta com `more`/`next_cursor`), filtro por janela de tempo
  (`time_range_field`: `create_time` ou `update_time`, `time_from`/`time_to` em Unix timestamp) e
  filtro opcional por `order_status`.
- **Detalhe de pedido(s):** `v2.order.get_order_detail` — recebe `order_sn_list` (até 50 SNs por
  chamada) e `response_optional_fields` (lista dos campos que devem vir na resposta, ex.:
  `item_list`, `recipient_address`, `total_amount`) — modelo "campos opcionais" parecido com o que
  já vimos como boa prática (evita payload gigante quando só parte dos campos importa).
- **Pedidos prontos para envio / relacionados a logística:** `v2.order.get_shipment_list`
  (`page_size`/`cursor`, devolve pedidos prontos para envio ou já enviados, com
  `package_number`/`logistics_status`), `v2.order.get_package_detail`,
  `v2.order.search_package_list`.
- **Divisão de pedido:** `v2.order.split_order` / `v2.order.unsplit_order`.
- **Cancelamento:** `v2.order.cancel_order`; cancelamento **iniciado pelo comprador** é tratado à
  parte via `v2.order.handle_buyer_cancellation` (`order_sn` + `operation`: `ACCEPT`/`REJECT`) —
  ou seja, cancelamento por comprador não é automático, exige decisão do seller (ou da nossa
  aplicação) via API.
- **Reservas/agendamento** (usado em alguns fluxos, ex. commerce ao vivo ou pré-venda):
  `v2.order.get_booking_list` / `get_booking_detail` — status citados:
  `READY_TO_SHIP`, `PROCESSED`, `SHIPPED`, `CANCELLED`, `MATCHED`. Não confirmado se isso é
  relevante para o catálogo típico de um seller brasileiro ou é específico de outro mercado.

### Status de pedido — divergência entre fontes (não resolvida)

Duas fontes trouxeram listas parcialmente diferentes de `order_status`, nenhuma delas
apresentada como exaustiva:

- Fonte A: `UNPAID`, `READY_TO_SHIP`, `RETRY_SHIP`, `SHIPPED`, `TO_CONFIRM_RECEIVE`, `IN_CANCEL`,
  `CANCELLED`, `TO_RETURN`, `COMPLETED`.
- Fonte B (docs do SDK): `UNPAID`, `READY_TO_SHIP`, `PROCESSED`, `SHIPPED`, `COMPLETED`,
  `CANCELLED`, `INVOICE_PENDING`.

**Não confirmado**: se `PROCESSED` e `INVOICE_PENDING` são estados reais e atuais da API ou
nomenclatura de versão antiga/depreciada; o enum completo e oficial precisa ser confirmado com uma
chamada real ou com a doc oficial. Ainda assim, dá para propor um mapeamento **hipotético** (a
confirmar, não a assumir como fato) para os status internos, seguindo o mesmo espírito da tabela
que já existe para a TikTok:

| Status Shopee (hipótese)                  | Status interno equivalente (hipótese) |
| ------------------------------------------ | -------------------------------------- |
| `UNPAID`                                    | `CREATED` (aguardando pagamento)       |
| `READY_TO_SHIP` / `PROCESSED`                | `PAID` (pago, aguardando separação)    |
| `RETRY_SHIP`                                 | `READY_TO_SHIP` (tentativa de envio falhou, requer nova tentativa) |
| `SHIPPED`                                    | `SHIPPED`                               |
| `TO_CONFIRM_RECEIVE`                         | `SHIPPED` (em trânsito, aguardando confirmação do comprador) |
| `COMPLETED`                                  | `DELIVERED`                             |
| `IN_CANCEL`                                  | transição para `CANCELLED` (cancelamento em andamento) |
| `CANCELLED`                                  | `CANCELLED`                             |
| `TO_RETURN`                                  | `RETURN_REQUESTED`                      |
| `INVOICE_PENDING`                            | não mapeado — significado não confirmado |

Qualquer status fora dessa lista, na implementação futura, deve seguir o mesmo princípio já usado
para a TikTok: nunca adivinhar transição interna a partir de um status desconhecido — preservar
`externalStatus` bruto e registrar para revisão manual.

### Webhook / push para atualização de pedidos

**Confirmado**: existe mecanismo de push (ver seção 7) com códigos de evento dedicados a
"atualização de status de pedido" e "atualização de rastreio" — ou seja, a Shopee tem um
equivalente ao webhook da TikTok, não depende só de polling.

## 3. Products API

**Confirmado (via `docs/managers/product.md`):**

- **Listar produtos:** `v2.product.get_item_list` — `offset`/`page_size` (máx. 100),
  `update_time_from`/`update_time_to`, filtro `item_status` (`NORMAL`, `DELETED`, `UNLIST`,
  `BANNED`). Resposta: `total_count`, `item[]`, `has_next_page`.
- **Detalhe de produto(s):** `v2.product.get_item_base_info` — `item_id_list` (até 50),
  flags opcionais `need_tax_info`/`need_complaint_policy`. Resposta traz `item_name`,
  `price_info`, `stock_info`, `dimension`, entre outros.
- **Variantes/SKUs:** `v2.product.get_model_list` (por `item_id`) — devolve `tier_variation[]`
  (as dimensões da variação, ex. Tamanho/Cor) e `model[]` (as combinações reais), cada `model`
  trazendo `model_sku` (SKU do vendedor por variação), `price_info` e `stock_info` próprios. Ou
  seja, o "SKU" no sentido de código do vendedor vive em `model_sku`, não em `item`.
- **Criar variação:** `v2.product.init_tier_variation` (`tier_variation[]` +
  `model[]` com `tier_index`, `normal_stock`, `original_price`, `model_sku`) e
  `v2.product.update_model` para editar modelos existentes.

Preço aparece como `original_price` dentro de `price_info`; estoque aparece como `normal_stock`
dentro de `stock_info` — em ambos os casos, por `model_id` quando o produto tem variação.
**Não confirmado**: como fica a estrutura para um produto **sem** variação (só um SKU implícito)
— se ele também tem um `model_id` "fantasma" ou se os campos de preço/estoque ficam direto no
nível do item. Precisa validar com um produto real sem variação.

## 4. Inventory / atualização de estoque

**Confirmado:** `v2.product.update_stock` — recebe `item_id` + `stock_list[]`, cada entrada com
`model_id` e `normal_stock`. É assim que o nosso sistema empurraria estoque para a Shopee.
Preço é uma chamada separada: `v2.product.update_price` (`item_id` + `price_list[]` com
`model_id`/`original_price`) — ou seja, estoque e preço **não** são atualizados na mesma
chamada, diferente de alguns marketplaces que aceitam os dois campos num único payload.

**Não confirmado**: limite de quantos `model_id` por chamada em `update_stock`/`update_price`
(a TikTok, por comparação, costuma limitar a alguns itens por lote) — nenhuma fonte consultada
trouxe esse número para a Shopee.

## 5. Finance / Payment API — a mesma divisão problemática que já vimos na TikTok

Esta é a parte mais importante para não repetir o problema real que já tivemos em produção com a
TikTok (pedido "pago" ≠ comissão "liquidada financeiramente"). **A resposta, com razoável
confiança pelas fontes consultadas, é que a Shopee tem exatamente a mesma divisão estrutural:**

- **Orders API nunca traz taxa/comissão.** `v2.order.get_order_detail` traz valores do pedido em
  si (itens, endereço, total), mas nenhuma fonte consultada indicou campos de comissão/taxa de
  plataforma dentro da resposta de `order`. Quem carrega essa informação é uma API separada:
- **Payment API** (`v2.payment.*`), com o dado por pedido vindo de:
  - `v2.payment.get_escrow_detail` (um pedido) / `v2.payment.get_escrow_detail_batch` (1–50
    pedidos) / `v2.payment.get_escrow_list` (por janela de tempo) — resposta citada incluindo:
    valor pago pelo comprador, preço/desconto do item, taxa de frete, **taxa de comissão, taxa de
    transação, taxa de serviço**, imposto retido (withholding tax), cupons/moedas, e o valor final
    em "escrow" (o que efetivamente fica retido/repassado ao seller).
  - `v2.payment.get_wallet_transaction_list` — extrato de transações da carteira (citado como
    "lojas locais" apenas, não cross-border).
  - `v2.payment.get_payout_info` (atual) / `v2.payment.get_payout_detail` (citado como
    **depreciado**) / `v2.payment.get_billing_transaction_info` — dados de repasse (payout),
    citados como específicos de **cross-border**; não confirmado se Brasil, operando como
    mercado local, usa esse fluxo ou o `wallet_transaction_list` local.
  - `v2.payment.generate_income_report` + `get_income_report` e
    `v2.payment.generate_income_statement` + `get_income_statement` — padrão assíncrono
    (solicitar geração → consultar status → baixar), estruturalmente parecido com o fluxo
    "Get Statements → Get Transactions" que já implementamos para a TikTok.

- **O atraso entre pedido e dado financeiro é citado explicitamente por uma fonte**: os detalhes
  de pagamento/escrow **"podem não estar disponíveis imediatamente para pedidos em
  `READY_TO_SHIP`"**, tornando-se disponíveis **depois que o pedido é marcado como `SHIPPED` ou
  `COMPLETED`**. Isso confirma, com uma fonte razoavelmente específica (mas não a documentação
  oficial em primeira mão — **precisa validação**), que a Shopee tem o mesmo tipo de defasagem
  financeira que a TikTok: **pedido pago não implica comissão/valor líquido já disponível via
  API** — a tela de conciliação futura precisa do mesmo tratamento que já existe hoje para a
  TikTok ("Pendente de liquidação" em vez de R$ 0,00).

**Categorias de taxa observadas** (para uma futura tabela de mapeamento equivalente à que já
existe em `tiktok-data-mapping.md`): comissão da plataforma, taxa de transação, taxa de serviço,
imposto retido (withholding tax), ajuste de frete, cupons/moedas do comprador, e o valor final de
escrow. Nenhuma fonte trouxe uma lista fechada e oficial dessas categorias — qualquer mapeamento
futuro deve seguir o mesmo princípio já usado para a TikTok: categoria não reconhecida cai em
`OTHER` com o valor bruto preservado, nunca descartada.

## 6. Returns / refunds API

**Confirmado (via `docs/managers/returns.md`):**

- **Listar/detalhar:** `v2.returns.get_return_list` (paginado) / `get_return_detail`.
- **Decisão do seller:** `confirm` (aceitar), `dispute` (abrir disputa com evidência), `offer`
  (contraoferta durante negociação), `accept_offer` (aceitar oferta do comprador),
  `get_available_solutions` (soluções possíveis para aquele caso), `cancel_dispute`.
- **Evidência:** `upload_proof`/`query_proof` (texto/imagem/vídeo), `convert_image` (base64 →
  URL).
- **Logística de devolução com participação do seller** — citada explicitamente como aplicável a
  **TW e BR**: `get_shipping_carrier`, `upload_shipping_proof`, `get_reverse_tracking_info`. Ou
  seja, para o Brasil a Shopee prevê casos de devolução onde o **seller organiza a logística
  reversa**, diferente de um modelo 100% "a Shopee resolve sozinha".
- **Status do fluxo (citado, não confirmado como exaustivo):** `REQUESTED` → `PROCESSING` →
  `ACCEPTED` → `COMPLETED`, com estado alternativo `CANCELLED`.
- **Valor do reembolso:** campo `refund_amount`, com `max_refund_amount` como teto por solução;
  reembolso parcial é negociável via `offer()`.

Isso já é mais explícito do que o que encontramos para TikTok em relação a devolução com logística
reversa própria do seller no Brasil — vale investigar se isso é relevante para o fluxo real da
loja (depende da transportadora usada).

## 7. Rate limits e webhooks

### Webhooks / push (confirmado que existem; detalhes de assinatura divergem entre fontes)

- **Registro:** `v2.push.set_app_push_config` (nome de método citado no SDK) — configura uma
  **callback URL** (HTTPS obrigatório, citado por mais de uma fonte) e habilita/desabilita
  categorias de evento por código numérico.
- **Categorias de evento citadas** (tabela de códigos, não confirmada como completa/oficial):
  1–2: autorização/desautorização de loja; 3–4: atualização de status de pedido e de rastreio;
  5: "Shopee Updates"; 6–7: itens banidos e promoções; 8–13: mudança de estoque, webchat, upload
  de vídeo, expiração de API, registro de marca.
- **Formato do payload (citado):** `shop_id` (ausente em eventos de nível de partner), `code`,
  `timestamp`, `data` (string JSON com o detalhe do evento).
- **Assinatura do webhook — DIVERGÊNCIA ENTRE FONTES, não resolvida:** uma fonte descreve a
  assinatura chegando no header `Authorization` (formato citado como `SHA256 <hex>`, calculado
  sobre o corpo bruto com o `partner_key`); outra fonte cita um header diferente,
  `x-shopee-signature`. Ambas concordam que o algoritmo é **HMAC-SHA256 sobre o corpo bruto,
  chave = `partner_key`** — mas **o nome exato do header e o formato exato do valor (com ou sem
  prefixo `SHA256`, hex minúsculo puro, etc.) não puderam ser confirmados com uma fonte única e
  confiável**. Isso é equivalente ao que a TikTok exige (assinar `app_key + corpo bruto`) — pelo
  padrão de outras integrações da Shopee, o mais provável é que aqui também seja necessário um
  parser de corpo bruto dedicado (não o parser JSON global), mas o nome do header **precisa ser
  confirmado com um payload real de teste** antes de codificar a verificação.
- **Recuperação de mensagens perdidas:** citado um mecanismo `get_lost_push_message` (até 100
  mensagens, janela de 3 dias) + `confirm_consumed_lost_push_message` (para não receber de novo)
  — se isso é real, é uma rede de segurança melhor do que a que a TikTok oferece (onde não foi
  possível confirmar nenhuma política de reentrega). Mesmo assim, mesma lição da TikTok: **não
  tratar webhook como única fonte de verdade** — todo processamento deveria buscar o estado atual
  via API antes de aplicar qualquer mudança, com reconciliação periódica como rede de segurança
  real.
- Nenhuma fonte confirmou uma assinatura própria para o **request de API de saída** (o que a
  seção 1 já cobre) ser igual ou diferente da assinatura de webhook — mas os dois papéis são
  claramente distintos aqui (query `sign` para chamadas nossas → Shopee; header sobre corpo bruto
  para eventos Shopee → nós), o mesmo padrão de "duas assinaturas diferentes" que já existe na
  TikTok.

### Rate limits (fontes divergem, número não confirmado)

- Uma fonte cita **~10 requisições por segundo por loja**.
- Outra fonte cita **~100 requisições por minuto** (equivalente a ~1,6 req/s) sem especificar se é
  por loja, por app ou por endpoint.
- Nenhuma das duas é a documentação oficial. **Não dá para tratar nenhum desses números como
  correto** — a diferença é grande demais (quase 10x) para ser só variação de endpoint. A
  implementação futura deveria seguir o mesmo princípio já adotado para a TikTok: nunca
  hard-codar um número de rate limit específico como premissa de design; em vez disso, respeitar
  cabeçalhos de retry (`Retry-After` ou equivalente, se existir) e aplicar backoff genérico,
  confirmando o número real só quando houver acesso a uma conta de sandbox real e a resposta de
  erro de rate limit puder ser observada.

## 8. Considerações específicas do Brasil (NF-e)

**Esta é a diferença mais importante encontrada em relação à pesquisa da TikTok.** Na TikTok, a
conclusão foi que **não existe API alguma** para NF-e — o seller só consegue subir o XML pelo
Seller Center manualmente. Para a Shopee, o quadro é mais nuançado:

- **O modelo de fundo é o mesmo**: o **seller emite a própria NF-e** no seu sistema fiscal
  (obtendo autorização da SEFAZ) — a Shopee não emite a nota fiscal do vendedor. Isso é confirmado
  por fontes de ERPs fiscais brasileiros (fiscalpro.com.br): o fluxo é "emitir no sistema próprio,
  aguardar autorização, baixar o XML autorizado e enviá-lo pelo canal oficial indicado pelo
  marketplace".
- **Mas, diferente da TikTok, a Shopee Open API parece expor endpoints reais para isso** (citados
  no SDK de terceiros, módulo `v2.order.*`, region-gated para BR/PL ou BR/PH conforme o endpoint):
  - `v2.order.get_buyer_invoice_info` — `order_sn_list` (até 50) → devolve `number`,
    `create_time`, `tax_id` por pedido. Citado como aplicável a "regiões que exigem nota fiscal
    (ex.: BR, PL)".
  - `v2.order.download_invoice_doc` — `order_sn` → devolve uma `url` para baixar o documento de
    invoice já submetido. Citado como aplicável a **"PH e BR apenas"**.
  - `v2.order.upload_invoice_doc` — `order_sn` + `invoice_file` (conteúdo em base64) → sobe o
    arquivo de invoice para a Shopee. Também citado como **"PH e BR apenas"**.
  - Separadamente, para pedidos atendidos pelo **FBS (Fulfillment by Shopee — estoque em depósito
    da própria Shopee)**, existe um conjunto de endpoints específico de nota fiscal em lote:
    `v2.order.generate_fbs_invoices` (dispara geração assíncrona, aceitando tipo de documento e
    formato XML/PDF/ambos) → `v2.order.get_fbs_invoices_result` (status: `PROCESSING`/`READY`/
    `ERROR`) → `v2.order.download_fbs_invoices` (URL de download, **expira 30 minutos** depois de
    gerada).
- **Não confirmado, e importante não presumir**: se `upload_invoice_doc` aceita **só XML** ou
  também aceita o PDF do DANFE; qual o **modelo de NF-e** esperado (55 — venda, ou 65 — NFC-e);
  limite de tamanho do arquivo; se o upload por essa API substitui de fato o botão manual "Enviar
  NF-e" do Seller Center (mesma ação, canal diferente) ou se são fluxos paralelos e
  independentes; se existe uma verificação síncrona de validade do XML (rejeição imediata) ou só
  validação posterior. Uma fonte (anymarket) confirma que a Shopee **tornou obrigatório o envio do
  XML** (não bastando mais só a chave de acesso) para faturar o pedido — reforça que isso é
  relevante para o fluxo real, mas não diz se isso valeria pela API ou só pelo portal.
- **Conclusão prática, honesta**: diferente da TikTok (onde a resposta foi "não existe o que
  baixar/automatizar"), aqui a resposta é **"provavelmente dá para automatizar o envio do XML via
  `upload_invoice_doc`, mas isso precisa ser validado com uma chamada real de sandbox antes de
  virar premissa de arquitetura"** — o `ManualFiscalProvider` (mesmo usado pela TikTok e por todo
  o resto do sistema hoje) continua sendo o fallback seguro caso a validação não confirme o
  comportamento esperado, mas vale a pena investigar essa API antes de descartar a automação de
  vez, diferente da conclusão definitiva que tivemos para a TikTok.

## Próximos passos

Itens que exigem acesso real a uma conta de sandbox/Partner (Open Platform) da Shopee antes de
escrever qualquer linha de código de conector:

1. **Criar um app real no Open Platform** (`open.shopee.com`) e confirmar: que tipo de app está
   disponível (existe algo equivalente ao "Custom App" da TikTok para uso interno de uma única
   loja, ou só app público com processo de revisão?), e obter `partner_id`/`partner_key` reais
   de sandbox (`partner.test-stable.shopeemobile.com`).
2. **Rodar o fluxo OAuth completo uma vez** contra uma loja de teste e confirmar: os campos
   exatos da resposta de `/api/v2/auth/token/get` (`expire_in` é timestamp pronto ou segundos a
   somar?), se vem `shop_id` ou `merchant_id` ou ambos, e a validade real do `refresh_token`.
3. **Confirmar a fórmula de assinatura fazendo uma chamada real** — validar as três variações de
   base string (pública / loja / merchant) descritas na seção 1, e confirmar se o `access_token`
   precisa ir também em algum header HTTP (como a TikTok exige) ou só na query.
4. **Confirmar o enum completo e oficial de `order_status`** — as duas listas encontradas
   divergem em `PROCESSED`/`RETRY_SHIP`/`TO_CONFIRM_RECEIVE`/`IN_CANCEL`/`TO_RETURN`/
   `INVOICE_PENDING`; só uma chamada real a `get_order_list` com pedidos em vários estados
   (ou a doc oficial, se o acesso a `open.shopee.com` funcionar de outro ambiente) resolve isso.
5. **Confirmar o header e formato exatos da assinatura de webhook** (`Authorization` vs
   `x-shopee-signature`, formato do valor) registrando um app de teste com callback URL e
   provocando um evento real (ex.: autorizar/desautorizar a loja de teste).
6. **Confirmar o número real de rate limit** observando o código/header de erro devolvido ao
   estourar o limite em sandbox — as fontes públicas divergem demais (10 req/s vs 100 req/min)
   para virar premissa de design.
7. **Testar `v2.order.upload_invoice_doc` com uma NF-e de teste real** (XML autorizado por uma
   emissão de homologação) para confirmar formato aceito, tamanho máximo, e se o upload por API
   de fato substitui a ação manual do Seller Center — este é o ponto de maior valor gerado por
   uma implementação futura, já que aqui (diferente da TikTok) parece haver algo de fato
   automatizável.
8. **Confirmar a defasagem entre pedido e dado financeiro** rodando `get_order_detail` e
   `get_escrow_detail` para o mesmo pedido em estados diferentes (`READY_TO_SHIP`, `SHIPPED`,
   `COMPLETED`) para medir na prática quando o valor líquido/comissão fica disponível — a mesma
   armadilha que já causou problema real de produção com a TikTok.
