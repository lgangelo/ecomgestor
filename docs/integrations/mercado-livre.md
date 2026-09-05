# Mercado Livre (Mercado Libre) API — pesquisa para preparar uma futura integração

**Status: pesquisa concluída em 2026-09-04, sem código.** Este documento mapeia a API do Mercado
Livre no mesmo formato usado para TikTok Shop (`docs/integrations/tiktok.md` e
`docs/integrations/tiktok-data-mapping.md`) e Shopee (`docs/integrations/shopee.md`), para servir
de ponto de partida a uma sessão futura de implementação. Nenhuma linha de código de conector foi
escrita nesta pesquisa.

## Fontes consultadas

- [Rollout — Mercado Libre API Essential Guide](https://rollout.com/integration-guides/mercado-libre/api-essentials)
- [Rollout — Quick guide to implementing webhooks in Mercado Libre](https://rollout.com/integration-guides/mercado-libre/quick-guide-to-implementing-webhooks-in-mercado-libre)
- [dev.to — Como integrar a API do Mercado Livre](https://dev.to/fiamon/como-integrar-a-api-do-mercado-livre-3ikn)
- [api-evangelist/mercado-libre (GitHub)](https://github.com/api-evangelist/mercado-libre)
- [mercadolibre/nodejs-sdk (GitHub, SDK oficial)](https://github.com/mercadolibre/nodejs-sdk)
- [api2cart.com — MercadoLibre Developers API Guide (2026)](https://api2cart.com/api-technology/mercadolibre-developers-api/)
- Resultados de busca apontando para páginas oficiais em `developers.mercadolivre.com.br`
  (autenticação, itens, estoque distribuído, convivência Full/Flex, status de pedidos, taxas,
  provisões, nota fiscal, ambiente de testes) — **conteúdo dessas páginas não foi lido
  diretamente** (ver limitação abaixo), só os títulos/trechos que apareceram nos resultados de
  busca.
- Blogs/consultorias brasileiras sobre taxas e nota fiscal: agilize.com.br, qive.com.br,
  koncili.com, blog.bling.com.br, agittcontabilidade.com.br.

## Limitação importante e honesta

**Mesma limitação já registrada nas pesquisas de TikTok e Shopee**: o fetch direto de
`developers.mercadolivre.com.br` e de `developers.mercadolibre.com.ar` foi recusado com **HTTP 403
Forbidden** em toda tentativa (proteção anti-bot do portal). Nenhuma página da documentação oficial
foi lida diretamente nesta pesquisa — tudo abaixo vem de:

1. **Guias de terceiros que resumem a doc oficial** (Rollout, api2cart, api-evangelist) — de
   qualidade desigual; alguns trechos são só um parágrafo genérico sem detalhe técnico real
   (sinalizado explicitamente onde acontece).
2. **Um artigo prático em português** (dev.to) com um passo a passo real de implementação,
   incluindo URLs e nomes de parâmetro.
3. **Resultados de busca que citam trechos literais** de páginas oficiais (JSON de exemplo de
   resposta de token, nomes de endpoint) sem que a página em si tenha sido carregada — tratados
   como confirmados só quando o trecho citado é específico o bastante (nome de campo exato, path
   exato), nunca quando é só uma paráfrase genérica.

Sempre que uma informação apareceu **inconsistente entre fontes** (ex.: validade do access token),
isso é reportado como divergência explícita, nunca resolvido por adivinhação — mesmo princípio já
seguido nos outros dois documentos.

## 1. Autenticação (OAuth 2.0)

**Confirmado (múltiplas fontes, incluindo um trecho citado da doc oficial):**

1. Criar uma aplicação em `developers.mercadolivre.com.br` → "Minhas aplicações" → "Criar nova
   aplicação": nome, nome curto, descrição (até 150 caracteres), **Callback URL** (nossa
   `redirect_uri`) e as permissões desejadas (`Read`, `Write`, `Offline Access` — esta última é a
   que habilita receber um `refresh_token`, sem ela o acesso expira sem forma de renovar).
2. A aplicação recebe um **Client ID** (`APP ID`) e um **Client Secret** — mesmo modelo de
   credenciais que TikTok (`app_key`/`app_secret`) e Shopee (`partner_id`/`partner_key`).
3. **URL de autorização** (site Brasil): `https://auth.mercadolivre.com.br/authorization?response_type=code&client_id=<CLIENT_ID>&redirect_uri=<REDIRECT_URI>`
   — o vendedor loga, autoriza, e é redirecionado para a `redirect_uri` com um `code` (formato
   citado: `TG-<hash>-<user_id>`).
4. **Troca de código por token:** `POST https://api.mercadolibre.com/oauth/token` — parâmetros vão
   no **corpo** da requisição (não na query string, isso é citado explicitamente pela doc oficial
   via busca): `grant_type=authorization_code`, `client_id`, `client_secret`, `code`,
   `redirect_uri`.
5. **Resposta do token** (exemplo citado de uma fonte que reproduziu a doc oficial):
   ```json
   {
     "access_token": "APP_USR-123456-090515-8cc4448aac10d5105474e1351-1234567",
     "token_type": "bearer",
     "expires_in": 10800,
     "scope": "offline_access read write",
     "user_id": 1234567,
     "refresh_token": "TG-5b9032b4e23464aed1f959f-1234567"
   }
   ```
   Campos confirmados: `access_token` (prefixo `APP_USR-`), `token_type` (sempre `bearer`),
   `expires_in` (segundos), `scope`, `user_id`, `refresh_token` (prefixo `TG-`).
6. **Refresh:** mesmo endpoint (`POST /oauth/token`) com `grant_type=refresh_token` +
   `client_id`/`client_secret`/`refresh_token`.

### Divergência não resolvida: validade do `access_token`

- O JSON de exemplo citado mostra `"expires_in": 10800` (= **3 horas**).
- O texto que acompanhava esse mesmo resultado de busca afirmou **"6 hours"** (o que seria 21600).
- **Não confirmado qual dos dois é o valor real hoje** — os dois números aparecem de fontes
  derivadas da doc oficial, mas nenhuma foi lida diretamente. Implementação futura deve **ler o
  `expires_in` devolvido de verdade a cada resposta de token** em vez de hard-codar 3h ou 6h —
  mesmo princípio de nunca assumir um valor fixo sem confirmação que já vale para TikTok/Shopee.
- O `refresh_token`, diferente da Shopee (citada como ~30 dias) e da TikTok (7 dias pro access
  token), não teve validade encontrada em nenhuma fonte consultada — **não confirmado**.

## 2. Items API (produtos/anúncios)

**Atualização 2026-09-04 — CONFIRMADO com uma chamada real de `POST /items` em produção**
(script `apps/api/src/cli/publish-mercadolivre-item.ts`), depois de 4 tentativas reais/4 erros
reais corrigidos um a um. Isso substitui as suposições da pesquisa original abaixo.

- **Criar anúncio:** `POST https://api.mercadolibre.com/items` — payload real que funcionou:
  `category_id`, `price`, `currency_id`, `available_quantity`, `buying_mode: "buy_it_now"`,
  `condition: "new"`, `listing_type_id`, `family_name`, `pictures: [{ source }]`, `attributes[]`.
- **`listing_type_id` é obrigatório NA PRÁTICA** (não confirmado pela pesquisa original, que
  citava fontes divergentes) — sem ele, a API recusa com HTTP 400 `body.required_fields`. Valores
  válidos por site: `GET /sites/{site}/listing_types` (pra MLB/Marketplace normal, geralmente
  `free`/`gold_special`/`gold_pro` — nunca hard-codar, sempre consultar).
- **`family_name` é obrigatório NA PRÁTICA** — modelo "User Products"/"Preço por variação" do
  Mercado Livre, que agora é o padrão pra publicação (pelo menos nesta categoria/conta). É uma
  string genérica que agrupa variações do mesmo produto sob a mesma família.
- **`title` NUNCA deve ser enviado junto com `family_name`** — CONFIRMADO (API recusa com
  `body.invalid_fields`, "The fields [title] are invalid for requested call"): no modelo User
  Products, o Mercado Livre GERA o título sozinho a partir do domínio/atributos/family_name. Isso
  significa que o título "altamente buscável" que já geramos com IA (`ai-copy.types.ts`) não se
  aplica diretamente ao anúncio do Mercado Livre — só serve de contexto pro `family_name` e pros
  valores de atributo, o texto final visível é decidido pela própria plataforma.
- **Pegadinha confirmada (fonte + teste real)**: a **descrição do anúncio é um recurso separado**
  (`POST /items/{id}/description`, corpo `{ "plain_text": "..." }`), não um campo do payload de
  criação — precisa de uma segunda chamada depois de criar o item.
- **Atributos obrigatórios variam por categoria** — CONFIRMADO contra a categoria real "Bolsas"
  (MLB7022): de 88 atributos, só 2 são obrigatórios (`BRAND`, `MODEL`); todo o resto é opcional.
  Descoberto via `GET /categories/{category_id}/attributes`, sempre necessário antes de montar
  qualquer payload — nunca assumir um conjunto fixo.
- **`BRAND` tem lista fechada de marcas conhecidas** — marca própria/não-catalogada (ex.:
  "Venticelli") não aparece na lista; usar o valor de catálogo `"Generic"` (`value_id` real
  resolvido via busca por nome na lista de `values` do atributo) evita rejeição, ao custo de não
  identificar a marca própria no anúncio.
- **`SELLER_SKU`** (opcional, mas disponível): usado pra gravar nosso SKU interno no atributo,
  essencial pra reidentificar depois qual variação interna corresponde ao item quando a
  sincronização de pedidos/estoque existir.
- **Item recém-criado veio com `status: "paused"`**, não `active` — **NÃO CONFIRMADO o motivo**
  (revisão automática de conta reativada após período inativo? comportamento padrão de item criado
  via API? falta de algum dado opcional relevante?). Precisa checar no painel do vendedor o motivo
  exibido e, se for só uma questão de ativação manual, confirmar se existe uma chamada
  (`PUT /items/{id}` com `status: "active"`) pra automatizar isso depois.
- **Variações de verdade** (múltiplos SKUs/cores sob o mesmo anúncio, preço por variação): o
  teste real só cobriu um item de UMA variação — o payload completo de múltiplas variações sob o
  modelo `family_name`/User Products **continua não confirmado**, precisa de outro teste real
  dedicado antes de qualquer produto com mais de uma cor/tamanho ser publicado como variações de
  um mesmo anúncio (hoje cada variação viraria um anúncio "family" separado, sem ligação entre si
  visível pro comprador).

### Dados fiscais (NCM/CSOSN/CEST) — mecanismo SEPARADO

**Atualização 2026-09-05 — endpoint CONFIRMADO** (doc oficial lida diretamente via browser,
`developers.mercadolivre.com.br/pt_br/envio-dos-dados-fiscais`, não mais fonte secundária):

- **Cadastrar**: `POST https://api.mercadolibre.com/items/fiscal_information` — cadastra os dados
  fiscais sob um identificador `sku` PRÓPRIO (não necessariamente o mesmo `SELLER_SKU` do
  atributo do item, embora na prática devêssemos usar o mesmo valor pra manter os dois
  sincronizados). Corpo: `{sku, title, type: "single"|"bundle", measurement_unit?, cost,
  tax_information: {...}}`.
- **Vincular ao item**: um segundo `POST /items/fiscal_information/items` com `{sku, item_id,
  variation_id?}` — só DEPOIS de cadastrado, o SKU fiscal precisa ser explicitamente vinculado ao
  `item_id` real (`variation_id` em branco/omitido quando o item não tem variação clássica, o que
  é sempre o nosso caso — usamos `family_name`, nunca `variations[]`). **Confirmado no texto
  oficial**: uma vez vinculado, o vínculo sobrevive mesmo que o atributo `SELLER_SKU` do item seja
  alterado depois via `PUT /items/{id}` — não são a mesma coisa.
- **Replicação automática entre "itens irmãos" do mesmo User Product**: confirmado no texto
  oficial — cadastrar dados fiscais em UM item do `family_name` replica automaticamente pros
  demais itens do mesmo grupo. Ou seja, **não precisa repetir o cadastro fiscal por cor** — só
  vincular uma vez por família (mas cada item ainda precisa do seu próprio `POST .../items` de
  vínculo, o dado em si é que replica).
- **Atualizar**: `PUT /items/fiscal_information/$SKU_ID` (todos os campos) ou `PATCH` (só
  `cost`/`measurement_unit`/`fci`/`ex_tipi`/`tax_rule_id`/`med_anvisa_code`/`med_exemption_reason`
  — NCM/CSOSN/CEST exigem `PUT` completo, não são parciais).
- **Consultar**: `GET /items/fiscal_information/$SKU`, `GET /items/$ITEM_ID/fiscal_information/detail`,
  e `GET /can_invoice/items/$ITEM_ID` (+ `/variations/$VARIATION_ID`) pra saber se o item JÁ TEM
  tudo que precisa pra emitir NF-e (`status: true/false`) — útil como diagnóstico antes de tentar
  vincular.
- Payload completo de `tax_information` (todos os campos vistos na doc oficial, com a nota real
  sobre quando cada um se aplica):
  ```json
  {
    "sku": "QW123",
    "tax_information": {
      "ncm": "39263000",
      "origin_type": "reseller",
      "origin_detail": "2",
      "tax_rule_id": 651,
      "csosn": "500",
      "cest": "0100500",
      "fci": "A3F1D0A2-...",
      "ex_tipi": "01",
      "ean": "4242002824628",
      "net_weight": 123.0,
      "gross_weight": 123.0
    }
  }
  ```
- `tax_rule_id` só se aplica a Regime Normal — **deixar em branco pra Simples Nacional** (o caso
  desta empresa, confirmado pelo CSOSN default "102" visto no painel do usuário).
- Isso mapeia quase 1:1 com o modelo `CategoryFiscalProfile` já existente no nosso schema
  (`ncm`, `cest`, `csosn`, `origem`, `unidadeMedida`, `exTipi`, `fichaConteudoImportacao`) — já
  tem uma tela pronta pra cadastrar isso por categoria (`/produtos/categorias` → "Dados fiscais",
  Mercado Livre já disponível como opção de canal) — só falta CONECTAR esse cadastro ao fluxo de
  publicação (ainda não lido/usado em nenhum lugar hoje, nem no nosso módulo fiscal nem no script
  de publicação do Mercado Livre — endpoint agora confirmado, falta só implementar).
- **Ainda não confirmado**: se o cadastro é obrigatório pra todo anúncio ou só quando o vendedor
  quer emitir NF-e pelo "Faturador" do próprio Mercado Livre (a doc fala em "apto pra ser
  faturado", sugerindo que é opcional — um anúncio sem isso provavelmente continua ativo/vendável,
  só não habilita a emissão automática de nota pelo Mercado Livre) — nenhuma chamada real feita
  ainda contra `POST /items/fiscal_information`, próximo passo antes de automatizar.

## 3. Estoque

**Confirmado, mas com múltiplos endpoints dependendo do modelo logístico usado** — isto é
diferente de TikTok/Shopee, que têm um único endpoint de atualização de estoque:

- **Modelo clássico (item único, sem Full/Flex distribuído):** `PUT /items/{item_id}` com
  `available_quantity` no corpo.
- **Estoque distribuído / multi-origem** (quando o vendedor opera com mais de um "local de
  estoque"): `PUT /user-products/{USER_PRODUCT_ID}/stock/type/store/{STORE_ID}` — corpo
  `{"quantity": N}`.
- **Estoque Flex** (rede própria do vendedor, entrega no mesmo dia):
  `PUT /user-products/{USER_PRODUCT_ID}/stock/type/seller_warehouse`.
- **Convivência Full + Flex** (quando o vendedor usa os dois modelos ao mesmo tempo, cada um com
  saldo próprio): `PUT /user-products/{USER_PRODUCT_ID}/stock/type/selling_address` para atualizar
  o saldo Flex de forma independente do saldo Full.

**Não confirmado**: qual desses modelos vale pra uma conta nova/típica (provavelmente o clássico,
`PUT /items/{item_id}`, é o padrão pra quem não usa Full nem Flex) — precisa confirmar contra uma
conta de teste real qual endpoint responde antes de decidir a arquitetura do envio de estoque
(mesmo cuidado que já existe hoje com o `TIKTOK_INVENTORY_PUSH_ENABLED`: nunca habilitar push
automático sem confirmar o comportamento real primeiro).

## 4. Orders API

**Atualização 2026-09-05 — CONFIRMADO contra uma chamada real em produção, a partir da VM**

O script `apps/api/src/cli/check-mercadolivre-orders.ts` (`npm run check-mercadolivre-orders`) foi
executado de verdade a partir da VM de produção (o bloqueio de política de rede registrado em
2026-09-04 só acontecia no ambiente sandbox usado para escrever o script — rodando de onde a
integração já opera de fato, `GET /orders/search`, `GET /orders/{id}` e `GET /shipments/{id}`
funcionaram normalmente). A conta conectada (`VENTICELLIBOLSAS`, seller id `532363529`) tinha, no
momento do teste, **exatamente 1 pedido no total** (`paging.total: 1`) — a loja tinha ficado com
anúncios pausados/excluídos por um bom tempo antes desta integração (ver início deste documento),
então o histórico real de pedidos ainda é praticamente inexistente. Isso significa: os campos
abaixo são REAIS e CONFIRMADOS, mas o **enum completo de `order.status` continua incompleto** —
só o valor `"cancelled"` foi observado até agora, faltando ver um pedido pago/entregue de verdade.
Os tipos `MercadoLivreOrder`/`MercadoLivreOrderSearchResult`/`MercadoLivreShipment`
(`packages/integrations/src/mercadolivre/mercadolivre.types.ts`) cobrem só os campos vistos nesta
chamada — qualquer campo novo visto numa chamada futura deve ser adicionado lá, nunca inventado.

**Correção importante em relação à pesquisa original**: a hipótese de que a comissão de venda
(`sale_fee`) viria decomposta dentro de `payments[]` (com uma entidade separando "custo de vender
na plataforma" + "custo de cobrança via Mercado Pago" + "taxa de parcelamento") estava **errada**.
Na chamada real, `sale_fee` mora em cada item de `order_items[]` (um valor já calculado, em
`currency_id`, não percentual — `14.44` para um item de `76.00`, ≈19% neste caso) — e dentro de
`payments[]` o campo equivalente (`marketplace_fee`) veio **zerado** (o pedido foi cancelado e
estornado, então pode ser que esse campo só reflita valor real num pagamento efetivamente
liquidado — não confirmado, é só uma hipótese). Ou seja: pra calcular a comissão real de uma
venda, usar `order_items[].sale_fee`, não `payments[].marketplace_fee`.

**Confirmado (chamada real, `GET /orders/search?seller=<user_id>&limit=&offset=`):**

- Parâmetros `seller`/`limit`/`offset` funcionam exatamente como eram esperados; resposta traz
  `results[]` + `paging: {total, offset, limit}` (mesmo formato de paginação já usado em outros
  endpoints do Mercado Livre).
- Cada pedido tem `pack_id` (agrupamento de pedidos comprados juntos pelo mesmo comprador — existe
  independente de ter ou não mediação), `mediations[]` (presente quando há uma disputa aberta —
  neste caso o comprador cancelou via mediação, `cancel_detail.code: "buyer_cancel_express"`),
  `tags[]` (valores reais vistos: `"pack_order"`, `"not_delivered"`, `"not_paid"` — provavelmente
  cumulativos/informativos, não um enum fechado de status) e `static_tags[]` (só `"pack_order"`
  visto, aparenta ser um subconjunto de `tags` que não muda com o tempo).
- `order_items[].item.seller_sku` está presente. No único pedido visto até agora o valor
  (`"MLB6717678206_201389264747"`, formato `{item_id}_{variation_id}`) não batia com o SKU interno
  que enviamos como atributo `SELLER_SKU` — **mas isso é esperado**: confirmado pelo usuário que
  esse pedido é anterior à publicação atual dos produtos (item antigo, de antes do `SELLER_SKU`
  ser enviado na criação), não um sinal de que o Mercado Livre sobrescreve o campo. Mesmo assim,
  a estratégia mais segura pra casar pedido↔variação interna continua sendo o nosso
  `ChannelProductMapping` (que já guarda `externalProductId`/`externalSku` por variação), com
  `seller_sku` como confirmação auxiliar quando bater — só reavaliar se um pedido de um produto
  publicado com o `SELLER_SKU` atual também vier divergente.
- `shipping: {id}` só traz o id — detalhe completo exige `GET /shipments/{id}` à parte (confirmado
  funcionando, ver abaixo).

### Status do pedido — parcialmente confirmado (só 1 amostra real disponível)

**Confirmado**: `status: "cancelled"` é um valor real (bate com um dos 4 valores hipotéticos que a
pesquisa original tinha levantado a partir de nomenclatura de **pack**, não de pedido —
`released`/`error`/`pending_cancel`/`cancelled` — então pelo menos esse coincidiu). **Ainda não
confirmado**: todos os outros valores (a hipótese mais comum entre integrações de terceiros é algo
como `confirmed`/`payment_required`/`paid`/`shipped`/`delivered`/`cancelled`/`invalid`, mas
**nenhum desses além de `cancelled` foi visto numa resposta real** — não assumir nenhum deles no
código até aparecer de verdade). Assim que a loja tiver mais pedidos reais (idealmente um pago e
entregue), rodar `npm run check-mercadolivre-orders` de novo pra completar o enum antes de
qualquer lógica que dependa de um valor específico de `status`.

**Confirmado (`GET /shipments/{id}`)**: `mode: "me2"` (Mercado Envios 2/clássico — ver seção 5),
`status: "cancelled"` (mesmo pedido), `logistic_type: "drop_off"`, `tracking_method: "Sedex"`. Full
e Flex (as outras duas modalidades da seção 5) ainda não foram vistas numa resposta real.

## 5. Envios (Mercado Envios / Full / Flex)

**Confirmado:** existe todo um subsistema de logística ("Mercado Envios 2") com pelo menos três
modalidades relevantes, cada uma com implicações diferentes pro nosso lado (reserva de estoque,
endpoint de atualização de saldo — ver seção 3):

1. **Mercado Envios clássico** — o vendedor despacha, o Mercado Livre contrata a transportadora.
2. **Full** — o vendedor transfere fisicamente o estoque pra um depósito do Mercado Livre; a
   partir daí o próprio Mercado Livre separa/despacha/emite a nota fiscal (ver seção 8) sem ação
   do vendedor por pedido.
3. **Flex** — rede de entrega própria do vendedor (geralmente entrega no mesmo dia), com saldo de
   estoque próprio e independente do saldo "normal".

**Não confirmado**: o recurso de detalhe do envio (`GET /shipments/{shipment_id}`, inferido a
partir do path citado pra nota fiscal na seção 8) não teve seu schema completo confirmado por
nenhuma fonte.

## 6. Taxas, comissão e billing ("provisões")

**Confirmado:**

- **API de "Fees for listing"** (somente leitura) — permite consultar **antes de criar o anúncio**
  quanto vai custar listar um item sob um `listing_type` específico, pra um dado site/categoria/
  moeda/quantidade. Útil pra mostrar uma estimativa de custo ao operador antes de publicar.
- **Estrutura da comissão** ("Custos por vender"): dois componentes somados —
  **CVFV** (custo variável por venda, percentual sobre o preço, depende de categoria + tipo de
  anúncio) e **CVFF** (custo variável fixo, valor fixo por unidade vendida, varia por faixa de
  preço). A soma dos dois é o que aparece como "Comissão" na fatura.
- **API de "provisões"** — o equivalente funcional ao "Statements" da TikTok e ao "income
  report" da Shopee: permite consultar o detalhamento de faturas e cobranças por período, por
  **unidade de negócio** (Mercado Livre, Mercado Pago, Mercado Envios Flex, Fulfillment,
  Insurtech — cada uma cobra/fatura separadamente), paginado via `limit` (máx. 1000, padrão 150) +
  `from_id`.
- **Mesma cautela de sempre sobre atraso pedido→dinheiro**: quando o envio usa Mercado Envios, o
  prazo de liberação do valor **varia conforme reputação do vendedor, tipo de produto e canal de
  venda** — o Mercado Livre acompanha a confirmação de entrega e só libera o valor depois disso.
  Ou seja, mesma armadilha real já enfrentada em produção com a TikTok ("pedido pago" ≠ "dinheiro
  liberado"), aqui condicionada à confirmação de ENTREGA (rastreada pelo próprio ML) em vez de um
  prazo fixo em dias — a tela de conciliação futura precisa do mesmo tratamento "pendente de
  liquidação" já usado hoje pra TikTok.

**Não confirmado**: número exato de dias/regras de liberação por faixa de reputação — nenhuma
fonte trouxe uma tabela concreta.

## 7. Webhooks / notificações

**Confirmado (com ressalvas):**

- **Registro:** `POST /applications/{APP_ID}/webhooks` (ou configurado direto na tela de criação
  da aplicação no devcenter) com `topic` + `callback_url`.
- **Topics citados:** `orders_v2` (pedidos confirmados/atualizados), `items` (mudança em anúncio),
  `items_prices` (preço criado/atualizado/removido), `questions` (nova pergunta), `payments`
  (status de pagamento), `stock-locations` / `stock-fulfillment` (mudanças de estoque em depósitos
  Full).
- **Recuperação de notificação perdida:** `GET /missed_feeds?app_id={APP_ID}` — mesmo tipo de rede
  de segurança que a Shopee parece oferecer (`get_lost_push_message`) e que a TikTok não tem
  confirmado.
- **Ferramenta de teste**: o devcenter oferece um "webhook tester" pra simular eventos antes de ir
  pra produção — não confirmado o funcionamento exato.
- **Não confirmado (fontes fracas/genéricas)**: nome exato e formato do header de assinatura do
  webhook — uma fonte citou `x-signature`, mas sem detalhe de algoritmo/formato o suficiente pra
  virar premissa de implementação (diferente da Shopee, onde ao menos o algoritmo HMAC-SHA256 foi
  confirmado por múltiplas fontes, só o nome do header ficou em aberto). Mesmo princípio de sempre:
  **nunca tratar o payload do webhook como fonte de verdade** — toda mudança deve buscar o estado
  atual via API antes de aplicar, com reconciliação periódica como rede de segurança real (mesmo
  padrão já usado hoje pra TikTok).

### Rate limits

Uma única fonte (não a doc oficial) citou **~1500 requisições por minuto por vendedor**, com
resposta vazia + provável HTTP 429 ao exceder. **Não confirmado por segunda fonte** — tratar como
estimativa, nunca como premissa de design; seguir o mesmo princípio já adotado para TikTok/Shopee
de respeitar cabeçalhos de retry e aplicar backoff genérico.

## 8. Nota fiscal (Brasil) — quadro mais favorável que TikTok e Shopee

- **Modelo de fundo igual**: fora do Full, o vendedor emite a própria NF-e no seu sistema fiscal —
  o Mercado Livre não substitui isso.
- **Mas o Mercado Livre tem um emissor integrado na própria plataforma** ("Emissor"/painel de
  notas fiscais dentro do Mercado Livre) que pode gerar a NF-e/NFC-e automaticamente para o
  vendedor, dependendo da configuração — algo que nem TikTok nem Shopee oferecem hoje.
- **Full é diferenciado**: quando o pedido é atendido pelo depósito Full, o **"ML Faturador" é
  obrigatório e automático** — o próprio Mercado Livre emite a nota, o vendedor não age por
  pedido.
- **Endpoint de API confirmado**: `GET /users/{id}/invoices/shipments/{shipment_id}` — permite a
  um ERP buscar a nota fiscal já emitida pelo Mercado Livre associada a um envio (relevante
  sobretudo pra operações Full, onde é o Mercado Livre quem emitiu).
- **Contexto regulatório relevante pro timing de uma implementação futura** (não específico do
  Mercado Livre, é mudança de regra da SEFAZ que afeta toda emissão fiscal no Brasil): Nota
  Técnica 2025.002 (ajustes de NF-e para IBS/CBS, obrigatório a partir de agosto/2026), e a partir
  de outubro/2026 (Ajuste SINIEF 23/26) alguns casos passam a exigir NF-e modelo 55 em vez de
  NFC-e modelo 65 quando o comprador quer aproveitar crédito de ICMS — não é algo que a integração
  precise resolver sozinha, mas é bom ter em mente o calendário se a implementação acontecer perto
  dessas datas.
- **Conclusão prática**: para vendas fora do Full, o `ManualFiscalProvider` (mesmo usado hoje por
  TikTok/Shopee e pelo resto do sistema) continua sendo o fallback seguro. Mas o endpoint de
  invoices por shipment é um caminho real de automação pra quando o pedido for atendido pelo Full
  — vale validar com uma conta de teste real (ver seção 9) antes de assumir como premissa de
  arquitetura.

## 9. Ambiente de testes — diferente de TikTok e Shopee

**Confirmado, e é uma diferença importante**: o Mercado Livre **não tem sandbox** (nenhum host
alternativo tipo `partner.test-stable.shopeemobile.com` da Shopee) — os testes acontecem **direto
em produção**, usando **"usuários de teste"**:

- `POST https://api.mercadolibre.com/users/test_user` com `{"site_id": "MLB"}` (Brasil) — cria uma
  conta de teste isolada.
- Limite de **10 usuários de teste** por conta de desenvolvedor.
- **Credenciais não recuperáveis**: precisam ser salvas no momento da criação — não existe endpoint
  pra listar usuários de teste já criados nem recuperar senha perdida (perdeu, cria outro).
- Usuários de teste **só conseguem transacionar entre si** (anúncio de usuário de teste só é
  "comprável" por outro usuário de teste) — recomendação de sempre criar **pelo menos um usuário
  vendedor e um comprador** de teste pra simular o fluxo completo.
- **Expiram por inatividade**: um usuário de teste sem atividade por 60 dias é removido
  automaticamente.

Isso muda o próximo passo prático em relação a TikTok/Shopee: aqui dá pra **criar o ambiente de
teste imediatamente após ter uma aplicação criada** (não depende de aprovação de terceiros como a
revisão de app público da Shopee), mas qualquer teste ainda roda contra a infraestrutura real de
produção, então tags de teste devem ficar isoladas de dados reais no nosso lado.

## Comparação rápida com o que já existe (TikTok, Shopee)

| Aspecto | TikTok Shop | Shopee | Mercado Livre |
| --- | --- | --- | --- |
| Sandbox real | Não confirmado | Sim (`test-stable`) | **Não existe** — usuários de teste em produção |
| Comissão visível no pedido | Não (API financeira separada) | Não (API financeira separada) | **Parcialmente sim** (MLB: `sale_fee` no próprio pedido) + API de "provisões" separada pro definitivo |
| Emissão de NF-e via API | Não existe | Provável (`upload_invoice_doc`), não confirmado | **Emissor próprio integrado** + API de consulta (`invoices/shipments/{id}`), mais forte que as outras duas |
| Atraso pedido→dinheiro liberado | Sim (confirmado, já corrigido em produção) | Sim (esperado, mesmo padrão) | Sim (ligado à confirmação de entrega, não a um prazo fixo) |
| Modelo de estoque | Único endpoint | Único endpoint (`update_stock`) | **Múltiplos endpoints** dependendo de Full/Flex/clássico |

Arquitetura de código recomendada pra quando a implementação começar: mesmo padrão já usado pra
Shopee (`packages/integrations/src/mercadolivre/{tipos, erros, signer se precisar, auth, client}`,
`apps/api/src/integrations/mercadolivre/{credentials.service, token-refresh.service,
connector.factory, oauth.service, oauth.controller, health.service, controller, module}`),
registrando o módulo **antes** do `IntegrationsModule` genérico em `app.module.ts` (mesmo cuidado
de ordem de rotas já documentado pra Shopee/TikTok).

## Achado real corrigido: anúncios duplicados na publicação automática (Bloco 3)

Em produção, o mesmo produto acumulou **157 anúncios duplicados** ao longo de vários ciclos do
agendador (a cada 30 min). Causa raiz confirmada em `mercadolivre-products-sync.service.ts`: o
vínculo (`ChannelProductMapping`) só era salvo **depois** de `client.setItemDescription` —
qualquer falha nessa chamada (conteúdo específico da descrição rejeitado pelo Mercado Livre, nunca
confirmado qual regra exatamente) abortava a função antes do vínculo ser gravado. O item já tinha
sido criado de verdade no Mercado Livre nesse ponto, mas o sistema não tinha como saber disso — no
ciclo seguinte, `publishEligible` via aquele produto como "nunca publicado" e criava outro item
idêntico. Repetido a cada ciclo, indefinidamente.

Corrigido: o vínculo agora é salvo **imediatamente** depois de `createItem` ter sucesso, antes de
qualquer chamada de acompanhamento (`setItemDescription`, tag de cor). Uma falha ao definir a
descrição vira só um aviso no log (`mercadolivre_set_description_failed`), nunca aborta a
publicação — o mesmo padrão já usado pra `tagBaseItemColor`/`publishRemainingColors` (achados
anteriores da mesma função). Teste de regressão cobrindo isso em
`mercadolivre-products-sync.service.spec.ts`.

**Limpeza necessária em produção**: os itens duplicados criados antes desta correção precisam ser
encerrados manualmente no Mercado Livre (não existe endpoint de exclusão confirmado — só
`status: closed` via `updateItem`, ou exclusão manual pelo painel do vendedor para itens sem
venda). O `ChannelProductMapping` de cada variante afetada deve ser conferido/limpo depois —
`check-mercadolivre-duplicate-publish` (script de diagnóstico) ajuda a confirmar quais variantes
tiveram mais de um item criado ao longo do tempo, usando o histórico do audit log.

## Próximos passos

Itens que exigem uma aplicação real no Mercado Livre Developers antes de escrever qualquer linha
de código de conector:

1. **Criar a aplicação** em `developers.mercadolivre.com.br`, obter `client_id`/`client_secret`
   reais, e criar pelo menos dois usuários de teste (`POST /users/test_user`, um vendedor e um
   comprador) — guardando as credenciais no momento da criação, já que não são recuperáveis depois.
2. **Rodar o fluxo OAuth completo uma vez** e confirmar: o `expires_in` real devolvido (resolve a
   divergência 3h vs. 6h da seção 1) e a validade real do `refresh_token` (não encontrada em
   nenhuma fonte).
3. **Descobrir a ficha de atributos obrigatórios de pelo menos uma categoria real** (bolsas/
   acessórios femininos, a categoria do nosso catálogo) via `GET /categories/{id}/attributes`,
   antes de desenhar o formulário de "publicar no Mercado Livre" — sem isso não dá pra saber quais
   campos exigir do operador.
4. **Confirmar qual endpoint de estoque vale pra uma conta nova sem Full/Flex** (provavelmente
   `PUT /items/{item_id}` com `available_quantity`, mas não confirmado) — só then decidir a
   arquitetura de sincronização de estoque.
5. **Confirmar o enum completo de `order.status`** rodando `/orders/search`/`/orders/{id}` com
   pedidos em vários estados reais (nenhuma fonte consultada trouxe essa lista).
6. **Confirmar se a comissão do pedido (`payments[].sale_fee` pra MLB) já é suficiente** pra
   conciliação, ou se ainda é necessário consultar a API de "provisões" pro valor definitivamente
   liquidado — mesmo tipo de validação que já foi necessária pra TikTok em produção.
7. **Confirmar o header/algoritmo exato de assinatura de webhook** (só `x-signature` foi citado,
   sem detalhe de formato) registrando um app de teste com callback e provocando um evento real.
8. **Testar o endpoint de invoices por shipment** (`/users/{id}/invoices/shipments/{shipment_id}`)
   com um pedido Full de teste, pra confirmar se de fato dá pra automatizar a obtenção da NF-e
   nesses casos — este é o maior ganho potencial em relação a TikTok/Shopee nesta área.
