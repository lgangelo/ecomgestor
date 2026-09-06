# TikTok Shop — pesquisa oficial e plano de implementação (Fase 3)

**Status: pesquisa concluída em 2026-08-28.** Este documento substitui a versão da Fase 2
(checklist vazio) pelo resultado da pesquisa na documentação oficial da TikTok Shop Partner
Center, feita antes de qualquer linha de código da Fase 3.

## Fontes consultadas

- [TikTok Shop Partner Center — Guide for Developers](https://partner.tiktokshop.com/docv2/page/tts-developer-guide)
- [TikTok Shop Partner Center — Overview on TikTok Shop APIs](https://partner.tiktokshop.com/docv2/page/tts-api-concepts-overview)
- [TikTok Shop Partner Center — Authorization overview](https://partner.tiktokshop.com/docv2/page/authorization-overview-202407)
- [TikTok Shop Partner Center — API Rate Limit Policy](https://partner.tiktokshop.com/docv2/page/64f1991d64ed2e0295f3d2c0)
- [TikTok Shop Partner Center — Return, refund and cancel API overview](https://partner.tiktokshop.com/docv2/page/return-refund-and-cancel-api-overview)
- [TikTok Shop Partner Center — Finance API overview](https://partner.tiktokshop.com/docv2/page/finance-api-overview)
- [TikTok for Developers — Webhooks overview](https://developers.tiktok.com/doc/webhooks-overview/)
- [TikTok for Developers — Webhook signature verification guide](https://developers.tiktok.com/doc/webhooks-verification)
- [Hookdeck — TikTok Shop webhook signature verification reference](https://github.com/hookdeck/webhook-skills/blob/main/skills/tiktok-shop-webhooks/references/verification.md)
- [TikTok Shop Seller University BR — Emissão de NF-e no TikTok Shop](https://seller-br.tiktok.com/university/essay?knowledge_id=4896169624913680&lang=pt-BR)
- [TikTok Shop Seller University BR — Erros comuns na emissão de NF-e](https://seller-br.tiktok.com/university/essay?knowledge_id=4889522412848897)

**Limitação importante e honesta:** o Partner Center (`partner.tiktokshop.com/docv2/...`) é uma
SPA renderizada via JavaScript. Buscas e um leitor automatizado de páginas conseguiram confirmar
hosts, fluxo de autorização, mecanismo de assinatura, política de rate limit e a estrutura das
APIs de Finance/Returns, mas **não permitiram extrair com 100% de certeza cada string literal de
path de endpoint** (ex.: o path exato de "buscar pedidos" na versão vigente). Por isso, em vez de
inventar paths, o cliente HTTP do conector (`tiktok.client.ts`) centraliza todos os paths em um
único arquivo de constantes claramente marcado, para que a confirmação final (com uma conta real
no Partner Center, que este ambiente não possui) seja uma troca de uma linha, nunca um redesenho.
Nenhum endpoint foi inventado; onde a certeza não era total, o item fica marcado abaixo como
"a confirmar no Partner Center" em vez de apresentado como fato.

## 1. Custom App para uso na própria loja

Confirmado: a TikTok Shop Partner Center permite criar um **App** (tipo "Custom App", destinado a
uso interno por um único seller, sem passar pelo processo de aprovação pública de app de
terceiros) diretamente no Partner Center, escolhendo a categoria do app e as permissões (scopes)
necessárias. Ao criar o app, a TikTok gera **App Key** (também chamado App ID) e **App Secret**.

## 2. Fluxo OAuth / autorização

Confirmado (seção "Authorization overview" + guia geral):

```text
1. Seller acessa a URL de autorização da TikTok (`https://services.tiktokshop.com/open/authorize`),
   contendo o `service_id` do app e um `state` gerado pela aplicação (nunca pela TikTok).
2. Seller aprova o acesso no ambiente TikTok Shop.
3. TikTok redireciona para o redirect_uri configurado, com um `code` de autorização
   e o mesmo `state` enviado.
4. A aplicação troca o `code` por access_token/refresh_token via chamada servidor-a-servidor
   (usando App Key/App Secret, não o service_id).
```

**Erro real encontrado em produção**: o parâmetro `service_id` da URL de autorização **não é o
App Key** — é um identificador separado, exibido logo abaixo do nome do app na página "App &
Service" do Partner Center (variável `TIKTOK_SERVICE_ID`, distinta de `TIKTOK_APP_KEY`). Usar o
App Key ali faz a TikTok responder "This service does not exist" na tela de autorização, mesmo
com App Key/Secret válidos (eles continuam funcionando normalmente nas chamadas de API — só não
servem como `service_id`).

- Host de autenticação/token: `https://auth.tiktok-shops.com` — confirmado via múltiplas fontes
  (ex.: endpoint de refresh documentado como `GET https://auth.tiktok-shops.com/api/v2/token/refresh`).
- Resposta de token confirmada como contendo: `access_token`, `refresh_token`,
  `access_token_expire_in` (timestamp Unix), `refresh_token_expire_in` (timestamp Unix), `open_id`.
- Token de acesso expira por padrão em **7 dias**; refresh token tem validade mais longa.
- Exchange inicial de `code` por token: mesmo host (`auth.tiktok-shops.com`), path exato do passo
  de troca de código **a confirmar no Partner Center** (o padrão documentado publicamente é
  `/api/v2/token/get`, mas não foi possível confirmar com certeza absoluta via fetch automatizado
  — tratado como configuração central, nunca hardcoded no meio da lógica).

**Payload real confirmado em produção (Custom App, loja Venticelli Bolsas — logado uma vez via
debug temporário, já removido)**: `access_token`, `access_token_expire_in`, `refresh_token`,
`refresh_token_expire_in`, `open_id`, `seller_name`, `seller_base_region`, `user_type`,
`granted_scopes` (array, ex.: `["seller.product.basic", "seller.order.info", ...]`). **Não inclui
`shop_id` nem `shop_cipher`** — só a chamada separada abaixo os fornece.

**Erro real encontrado em produção**: `shop_cipher` é exigido como parâmetro em quase toda
chamada de negócio (produtos, pedidos, devoluções) — sem ele a API responde "Missing identifier.
The 'shop_cipher' query parameter is required to identify the target shop." (código `106013`).
A tabela oficial de erros do Partner Center (`docv2/page/common-errors`) confirma a fonte:
"Retrieve this value from the **Get Authorized Shops** endpoint" — ou seja, `GET
/authorization/{version}/shops` é mesmo o caminho certo (uma tentativa anterior trocou para
`GET /seller/{version}/shops`, "Get Active Shop List", achando que "Get Authorized Shops" não
funcionava para Custom Apps — **enganado**: o "Get Active Shop List" chegou a funcionar sem erro,
mas só devolveu `id`/`region`, nunca `cipher`, para esta loja local (BR); revertido).

O que de fato bloqueava "Get Authorized Shops" era falta de escopo — código `105005` ("Access
denied. The app is not authorized to access the endpoint because the access scopes granted for
the app or the access token do not contain the required access scope for the endpoint"), cuja
correção documentada é: 1) conferir/ativar o escopo certo em Partner Center → App & Service →
Manage API, 2) conferir o campo `granted_scopes` do **token**, e se faltando, pedir para o
vendedor reautorizar para gerar um token novo com o escopo. O escopo certo aqui é **"Shop
Authorized Information"** (Scope Key `seller.authorization.info`) — só ativar não bastava sem
reautorizar depois (mesma mecânica do próximo parágrafo).

Implementado em `handleCallback` (`apps/api/src/integrations/tiktok/tiktok-oauth.service.ts`) via
`getAuthorizedShops` (`packages/integrations/src/tiktok/tiktok.connector.ts`), best-effort — uma
falha aqui não derruba a conexão, só deixa `shop_cipher` vazio (bloqueando as chamadas de negócio
até resolver). Assume-se um único shop por token — a única topologia possível para um Custom App
(uso interno de um único seller). **Integrações conectadas antes desta correção precisam
reconectar a loja** (ver reautorização abaixo) para que o `shop_cipher` seja obtido e salvo — o
refresh de token sozinho não o busca retroativamente.

**Reautorização depois de adicionar um escopo novo**: confirmado no próprio Partner Center
("Gerenciar API" do app) — depois de ativar um escopo novo (ex.: "Shop Authorized Information"
acima), é preciso pedir para o vendedor **reautorizar direto pelo Seller Center** (botão
"Autorizar" na linha do app em "Meus aplicativos"), não pelo nosso botão "Conectar" — reconectar
pelo nosso fluxo normal não repropaga o escopo novo para o token (bate com a orientação oficial
do erro 105005 acima: "reauthorize... to generate a new access token accordingly"). Esse
"Autorizar" do Seller Center redireciona para o nosso callback (`/api/integrations/tiktok/callback`)
com um `code` válido, mas **sem `state`** (não passou pelo nosso `/connect`, que é quem gera o
state). `handleCallback` trata esse caso: sem `state`, mas com `code`, reidentifica a empresa pela
integração TikTok Shop já existente — só seguro porque hoje há uma única empresa usando essa
integração nesta instância; deixará de ser seguro se isto virar multi-tenant de verdade
(precisaria de outro mecanismo para saber a qual empresa pertence).

**Confirmado em produção (conexão real com a loja Venticelli Bolsas)**: os endpoints de busca
(`products/search`, `orders/search`, `returns/search`) são **POST**, não GET — usar GET faz a
TikTok responder "Invalid method. The HTTP method used is not supported by this endpoint.".
Paginação (`page_size`/`page_token`) vai na query string; filtros (janela de tempo, status) vão
no corpo JSON da requisição, mesmo que vazio (`{}`). `orders`/`{id}` (detalhe de um pedido) e os
endpoints de finance (`statements`, `.../statement_transactions`) continuam GET.

## 3. Host da API (produção)

Confirmado: `https://open-api.tiktokglobalshop.com` é o host usado para as chamadas de API de
negócio (produtos, pedidos, estoque, financeiro, devoluções), após obtenção do access token.
Não foi encontrada, nas fontes acessíveis, documentação de um host de sandbox separado e
estável para uso público — a homologação de app novo ocorre dentro do próprio Partner Center
(ambiente de revisão), não por meio de um host alternativo. Isto será revalidado quando o
Custom App for de fato criado no Partner Center.

## 4. App key / App secret

Confirmado: gerados na criação do app no Partner Center. Nunca hardcoded — usamos
`TIKTOK_APP_KEY`/`TIKTOK_APP_SECRET` via variável de ambiente (seção 4 do pedido), lidos apenas
em `apps/api/src/config/configuration.ts`.

## 5. Access token / 6. Refresh token / 7. Expiração

Confirmado (ver item 2): `access_token_expire_in`/`refresh_token_expire_in` como timestamps Unix
retornados pela própria API a cada emissão/refresh — a aplicação nunca calcula expiração por
conta própria, apenas lê o timestamp devolvido pela TikTok e o persiste.

## 8. Assinatura das requests

Confirmado, e **distinta da assinatura de webhook** (ver item 17): a TikTok Shop assina cada
chamada de API assinando **`app_secret` + path + query string ordenada + corpo + `app_secret`**
(o `app_secret` envolve a string dos dois lados — não é só a chave do HMAC), e envia o resultado
em um parâmetro de query `sign`, usando HMAC-SHA256 com o `app_secret` como chave. Os parâmetros
`sign` e `access_token` são excluídos do cálculo antes de ordenar. `timestamp` e `app_key` fazem
parte da query assinada. Implementado em `packages/integrations/src/tiktok/tiktok.signer.ts`.
O `access_token` também precisa ir no header `x-tts-access-token` (não só na query) — ver
`packages/integrations/src/tiktok/tiktok.client.ts`.

## 9. Paginação

Confirmado como baseada em cursor: as respostas de listagem trazem um token de próxima página
(`next_page_token` / `page_token` conforme o recurso) — nosso `Page<T>`/`PageParams` (contrato já
existente em `packages/integrations/src/index.ts`) já modela exatamente esse formato.

## 10. Rate limits

Confirmado: TikTok Shop aplica rate limit por loja/app usando o algoritmo **leaky bucket**, na
ordem de dezenas de requisições por segundo por loja (variação por endpoint e por tier de
parceiro). Quando excedido, a API retorna um código de erro específico de rate limit; o cliente
deve respeitar `Retry-After` quando presente e aplicar backoff. Implementado em
`tiktok.client.ts` (ver seção 26 do pedido).

## 11–15. Orders / Products / Inventory / Finance / Return & Refund APIs

Confirmado que todas essas APIs existem como categorias documentadas no Partner Center, com
escopos (scopes) próprios que precisam ser solicitados na criação do app:

- **Orders API**: busca/detalhe de pedidos, atualização de status de envio.
- **Products API**: criação, atualização, consulta de produtos/SKUs, incluindo estoque por SKU.
- **Inventory**: parte da Products API (atualização de estoque por SKU), não uma API separada.
- **Finance API**: fluxo confirmado como **Get Statements → Get Transactions by Statement (por
  `statement_id`) → Get Transactions by Order (por `order_id`)**, além de **Get Unsettled
  Transactions** para valores ainda não liquidados. Existe também uma "Get Payments API" (com
  histórico de migração de versão v202309 → v202605 mencionado na documentação, confirmando que
  os paths são versionados por data).
- **Return & Refund API**: documentada sob "Return, refund and cancel API overview" — cobre
  devoluções iniciadas pelo comprador, cancelamentos iniciados pelo seller e atualização de
  status de reembolso.

Os paths literais exatos de cada uma dessas chamadas (ex.: `/order/{version}/orders/search`)
seguem o padrão público conhecido de versionamento por data da TikTok Shop Open API, mas — pela
limitação de acesso automatizado descrita acima — são tratados como constantes centralizadas e
claramente marcadas como "a confirmar no Partner Center" em `tiktok.client.ts`, nunca espalhados
implicitamente pelo código.

## 16. Webhooks

Confirmado: TikTok Shop envia webhooks para eventos de pedido/produto/devolução para uma URL
registrada no Partner Center. Payload inclui identificador do evento (usado para idempotência).

## 17. Assinatura / validação de webhooks

Confirmado e **diferente da assinatura de API** (item 8): a assinatura chega no header
`Authorization`, como HMAC-SHA256 em hexadecimal minúsculo. A mensagem assinada é
`app_key + corpo bruto da requisição` (concatenação, não JSON), usando `app_secret` como chave.

```text
assinatura_esperada = hex( HMAC_SHA256( key = app_secret, message = app_key + raw_body ) )
```

**Ponto crítico confirmado**: a verificação precisa dos **bytes brutos do corpo**, antes de
qualquer `JSON.parse` — por isso o endpoint de webhook usa um parser de body bruto dedicado, não
o parser JSON global do Nest (ver seção 20 do pedido).

**Ponto crítico #2, confirmado explicitamente pela documentação**: *não há timestamp dentro da
assinatura*, logo a assinatura **não fornece proteção contra replay por si só**. A TikTok
recomenda usar o identificador do evento (`tts_notification_id` / equivalente) para idempotência
— exatamente o padrão que a seção 21 do pedido já exige (persistir `external_event_id` e
bloquear duplicidade via constraint única).

## 18. Política de retries (por parte da TikTok)

Não foi possível confirmar com uma fonte primária um número exato de tentativas de reentrega de
webhook por parte da TikTok. Por isso, a aplicação **não assume que webhooks são confiáveis
sozinhos** — todo processamento de webhook busca o estado atual via API antes de aplicar
qualquer mudança (seção 22 do pedido), e a reconciliação periódica (seção 23) é a rede de
segurança real, independente de quantas vezes a TikTok reentrega.

## 19. Documentos fiscais / NF-e para sellers brasileiros — CONCLUSÃO

**Pergunta do pedido:** "A API oficial permite listar ou baixar os XMLs das NF-e emitidas pelo
TikTok Shop para venda e devolução?"

**Resposta confirmada, com fonte oficial (TikTok Shop Seller University BR):** **Não — e o
motivo é que o modelo é invertido.** A TikTok Shop **não emite** a NF-e do seller. É o **seller**
quem gera a própria NF-e (pelo Seller Center, preenchendo dados fiscais por produto, ou por XML
gerado no ERP próprio) e **envia (upload) essa XML para a TikTok Shop**, para anexar ao pedido e
imprimir a etiqueta/nota de envio. A TikTok apenas aceita o arquivo (`.xml`, até 10 MB) e gera
uma versão PDF simplificada para o envio — ela não é a fonte do documento fiscal.
Adicionalmente, hoje **apenas sellers MEI e Simples Nacional** podem usar o recurso de emissão de
NF-e da TikTok Shop; a NF-e é obrigatória para uso das transportadoras do próprio marketplace
(exceto Correios).

**Consequência arquitetural:** não existe "baixar XML da TikTok" a implementar (seção 43 do
pedido não se aplica — não há o que baixar). O fluxo real de XML é o mesmo que já construímos na
Fase 2: o usuário gera a NF-e no seu próprio sistema fiscal, sobe o XML manualmente. O
`ManualFiscalProvider` já existente permanece a via correta (seção 44 do pedido), sem scraping,
automação de navegador ou endpoint não documentado. Ver `docs/integrations/tiktok-data-mapping.md`
para o detalhe.

## Depois desta pesquisa — plano de implementação (executado nesta fase)

1. `packages/integrations/tiktok/` implementando `MarketplaceConnector` (client, auth, signer,
   mapper, types, errors) com paths de endpoint centralizados e marcados para confirmação final.
2. OAuth real: `GET /integrations/tiktok/connect` e `GET /integrations/tiktok/callback`, `state`
   criptograficamente aleatório com TTL curto persistido no Redis (proteção contra replay),
   credenciais persistidas criptografadas em `integration_credentials` (mecanismo novo, ver
   `packages/shared-server/src/crypto.ts`, já que não existia mecanismo de criptografia de
   segredos antes desta fase).
3. Importação de produtos/pedidos via job, nunca bloqueando o request HTTP.
4. Webhook com verificação de assinatura sobre corpo bruto, idempotência via
   `external_event_id`, enfileiramento para processamento assíncrono.
5. Reconciliação periódica (`tiktok.reconcile.orders`, intervalo configurável, default 15 min).
6. Comparação de estoque (somente leitura por padrão) com push manual auditado;
   `TIKTOK_INVENTORY_PUSH_ENABLED=false` por padrão.
7. Financeiro/settlement alimentando as entidades já existentes `settlements`/
   `settlement_transactions`.
8. Testes cobrindo tudo isso com HTTP mockado — nenhum teste depende da API real.

## Entregue nesta passagem (Fase 3)

Tudo o que está listado no plano acima foi implementado, incluindo os itens que o pedido original
descrevia com mais detalhe do que o resumo acima:

- **Produtos**: página de não-vinculados (`GET /integrations/tiktok/products/unmatched`), match
  automático sugerido mas nunca efetivado sozinho quando ambíguo, ações de vincular/ignorar/criar
  produto interno, todas auditadas.
- **Pedidos**: importação incremental com checkpoint + janela de sobreposição de 10 min, criação
  histórica (um pedido que chega já `SHIPPED` não repete as transições intermediárias — baixa
  estoque de uma vez), SKU sem vínculo nunca descarta o pedido (`integrationSyncStatus:
  REQUIRES_MAPPING` + endpoint de reprocessamento), atualização externa com proteção contra
  regressão fora de ordem (compara `externalUpdatedAt` e a posição no caminho linear de
  fulfillment antes de aplicar).
- **Webhook**: `POST /api/webhooks/tiktok`, assinatura verificada sobre o corpo bruto (via
  `rawBody: true` no Nest), idempotência por `external_event_id` + hash do payload, processamento
  sempre assíncrono (worker) que busca o estado atual via API antes de aplicar qualquer mudança,
  minimização de PII do comprador antes de persistir.
- **Falhas/retry**: fila nomeada `integration` (separada de `housekeeping`), classificação de erro
  (AUTH/RATE_LIMIT/TEMPORARY/VALIDATION/PERMANENT) decide se o BullMQ tenta de novo, tela "Falhas"
  com retry manual.
- **Estoque**: comparação sempre disponível; envio manual para a TikTok atrás de
  `TIKTOK_INVENTORY_PUSH_ENABLED` (default `false`), auditado.
- **Financeiro**: Statements → Transactions ingeridos em `settlements`/`settlement_transactions`;
  conciliação por pedido nunca mostra R$ 0,00 quando ainda não há liquidação — mostra "Pendente de
  liquidação".
- **Devoluções**: sincronizadas para o `Return` existente via `ReturnsService.upsertFromExternal`;
  nunca movimentam estoque sozinhas — a decisão de restock continua manual.
- **RBAC**: permissões granulares `integration.tiktok.read/connect/sync`,
  `integration.inventory.compare/push`, `integration.jobs.read/retry`.
- **Testes**: 18 testes novos (assinatura de API/webhook, mapper de status/financeiro, política de
  retry por categoria de erro, importação/reconciliação/reprocessamento de pedidos incluindo SKU
  sem vínculo e atualização fora de ordem) — nenhum depende de rede real; suíte total da API subiu
  de 27 para 52 testes unitários, todos passando.

## Entregue na Fase 4 — outbox de sincronização de estoque

A seção 51-56 da Fase 4 pediu para amadurecer a infraestrutura de sincronização automática de
estoque sem tocar no núcleo (`InventoryLedgerService`) e mantendo o push desligado por padrão.
Implementado em `apps/api/src/integrations/tiktok/tiktok-stock-outbox.service.ts` +
`tiktok-stock-outbox-scheduler.service.ts`:

- Job periódico a cada 5 minutos reaproveita `TikTokInventorySyncService.compare()` (a mesma fonte
  da tela de comparação manual) para detectar divergência e alimentar `stock_sync_outbox` — nunca
  instrumenta `OrdersService`/`ReturnsService`/`InventoryLedgerService` diretamente (acoplaria a
  integração ao núcleo de estoque, o oposto do que esta integração sempre evitou).
- Coalescing: uma nova divergência para o mesmo SKU atualiza a entrada `PENDING` existente em vez
  de criar uma segunda linha — só o valor final importa, nunca a sequência intermediária.
- Envio de fato exige **dois** interruptores ligados ao mesmo tempo:
  `TIKTOK_INVENTORY_PUSH_ENABLED` (servidor) **e** `Company.inventoryAutoSyncEnabled` (por
  empresa, toggle em Configurações → Empresa, só um ADMIN liga). Sem qualquer um dos dois, o
  outbox só acumula/detecta — nunca envia sozinho. Nenhum dos dois é ativado por
  migration/seed/deploy.
- A tela de comparação (`/integracoes/tiktok`, aba Estoque) ganhou os 4 estados (OK/Pendente/
  Divergente/Erro) e "Último sync", vindos do outbox — sem endpoint novo, o
  `GET /integrations/tiktok/inventory/compare` já existente passou a retornar esse relatório
  combinado.
- A tela também ganhou um tooltip no badge "Erro" com a mensagem real salva em
  `StockSyncOutboxEntry.lastError` (antes só o badge aparecia, sem nenhum detalhe) — script
  `check-stock-outbox-errors` lista as falhas atuais direto do banco, sem precisar de UI.
- **ACHADO REAL corrigido**: "Update Inventory" sempre falhava em produção com `Invalid path`. O
  path usado (`/product/{version}/products/inventory/update`) nunca tinha sido confirmado contra a
  doc oficial — o `product_id` faz parte do PATH, não só do corpo
  (`POST /product/202309/products/{product_id}/inventory/update`, confirmado em
  partner.tiktokshop.com/docv2/page/update-inventory-202309). `TikTokConnector.updateInventory`
  agora agrupa as atualizações por `externalProductId` e chama o endpoint certo por produto.
- **ACHADO REAL corrigido (segunda camada, mais sutil)**: mesmo com o path certo, o envio manual de
  estoque continuava sem efeito real na TikTok — sem erro nenhum aparecendo. Causa: o exemplo
  oficial de resposta desse endpoint mostra `code: 0` (sucesso) no envelope **mesmo quando um SKU
  específico falha** — o erro real fica só dentro de `data.errors[]` (ex.: `{code: 12052097,
  message: "The warehouse does not exist"}`). Como `TikTokClient.request` só olha o `code` do
  envelope, essa falha por SKU passava batendo como sucesso — silenciosa, sem nenhum sinal em
  lugar nenhum. `updateInventory` agora confere `data.errors` explicitamente e lança um erro real
  quando algo aparece lá.
- **Ainda não confirmado**: se `warehouse_id` é obrigatório por SKU pra esta conta (o exemplo
  oficial sempre inclui um, e boa parte dos códigos de erro documentados fala de armazém). A
  correção acima envia sem `warehouse_id` primeiro — agora que `data.errors` é conferido de
  verdade, um eventual erro de armazém ausente/inválido vai aparecer claro no
  `check-stock-outbox-errors` ou na tentativa manual, em vez de passar batido como sucesso.

## Conscientemente não implementado nesta fase

- **Sincronização automática de estoque disparada por venda** (seção 40 do pedido, Fase 3): a
  estrutura existia (`TikTokQueueService.enqueuePushInventory`), mas nada disparava isso
  automaticamente. Na Fase 4 (ver seção abaixo) isso evoluiu para um outbox com reconciliação
  periódica — ainda nunca disparado pela venda em si (a venda sempre faz commit interno primeiro,
  nunca espera a TikTok), e continua desligado por padrão.
- **Auto-abertura do wizard de importação** logo após o callback do OAuth — o usuário precisa
  clicar em "Importar dados" na aba Configurações uma vez após conectar. Poupa uma interação de UX,
  não é bloqueante.
- **Novos fixtures de seed** específicos da Fase 3 (um pedido de exemplo com `REQUIRES_MAPPING`,
  uma falha de job de exemplo) — o seed da Fase 1/2 já cobre um pedido e um settlement de exemplo
  no canal TikTok; não foram adicionados fixtures novos para os cenários específicos desta fase.
- **Confirmação final dos paths literais de endpoint** marcados "a confirmar no Partner Center" em
  `packages/integrations/src/tiktok/tiktok.types.ts` — exige uma conta real no Partner Center, que
  este ambiente de controle não tem. Hosts, fluxo OAuth, mecanismo de assinatura (API e webhook) e
  a estrutura das APIs de Finance/Returns foram confirmados com fontes oficiais; os paths exatos de
  cada chamada de negócio ficam centralizados em um único arquivo, prontos para a troca de uma
  linha quando confirmados.

## Pesquisa adicional (2026-09-06) — Publicação de produto na TikTok Shop (Create/Update Product)

**Mudança de direção decidida pelo usuário**: até aqui, a integração com a TikTok só fazia sentido
num sentido (importar pedidos/produtos de lá pra cá). O usuário decidiu que, daqui pra frente,
produtos nascem só na nossa plataforma (ecomgestor) e são enviados/atualizados automaticamente para
os marketplaces conectados (TikTok Shop, Mercado Livre, Shopee) quando o produto assume status
`ACTIVE`. Esta seção documenta a pesquisa feita navegando diretamente em
`partner.tiktokshop.com/docv2` sobre os endpoints de publicação (Create/Update Product), no mesmo
espírito de honestidade do resto deste documento.

**Aviso importante, válido pra TODA esta seção**: diferente das seções acima (que já tiveram
chamadas reais confirmadas em produção — ver "ACHADO REAL corrigido" em Update Inventory), aqui
**nenhuma chamada real foi feita ainda nesta conta**. Tudo abaixo vem só da leitura direta da
documentação oficial — cada endpoint fica marcado como **NÃO CONFIRMADO contra uma chamada real**,
mesmo quando o texto/exemplo citado da doc é literal. Antes de automatizar o envio de verdade, cada
um destes precisa passar pelo mesmo processo que já validou Create Item/Update Inventory: uma
chamada real, um erro real, uma correção real.

### 1. Create Product

`POST /product/202309/products`, escopo `seller.product.write`. **NÃO CONFIRMADO contra uma
chamada real nesta conta** — só a doc foi lida.

Campos principais:

- `save_mode`: `AS_DRAFT` cria o produto sem publicar; o default é `LISTING` (publica de fato).
- `title`.
- `description`: **HTML**, até 10.000 caracteres — diferente do Mercado Livre, que exige texto
  PLANO na descrição (`POST /items/{id}/description`, `{"plain_text": "..."}`, ver
  `docs/integrations/mercado-livre.md` seção 2). **Nunca aplicar a mesma limpeza de texto plano
  usada pro Mercado Livre aqui** — perderia a formatação HTML que a TikTok espera.
- `category_id`: precisa ser uma categoria-folha.
- `category_version`: `v2` = árvore de 7 níveis, obrigatório em US/EU/SEA; `v1` = 3 níveis, default
  nas demais regiões incluindo BR — **mas isso não está confirmado pra nossa conta**.
- `brand_id`.
- `main_images`: array de `{uri}` — o `uri` vem do endpoint de Upload de Imagem (seção 2 abaixo),
  **nunca uma URL nossa (R2) direto**.
- `skus[]`: ver seção 8 (modelo SKU/atributo de venda).
- `product_attributes[]`.
- `package_dimensions`/`package_weight`: obrigatório por padrão, exceto em categorias virtuais.
- `video`: objeto — **formato exato ainda não confirmado** pela pesquisa.

Resposta traz `product_id`, `skus[].id`, etc.

### 2. Upload de imagem

`POST /product/202309/images/upload`, escopo `seller.product.basic`, multipart/form-data
(`data` = arquivo, `use_case` = `MAIN_IMAGE`/`ATTRIBUTE_IMAGE`/`DESCRIPTION_IMAGE`/
`CERTIFICATION_IMAGE`/`SIZE_CHART_IMAGE`/`CUSTOMIZATION_IMAGE`). Formatos aceitos: JPG/JPEG/PNG/
WEBP/HEIC/BMP, máx. 10MB, dimensão de 100x100 a 20000x20000px (`MAIN_IMAGE` especificamente:
300x300 a 4000x4000). **NÃO CONFIRMADO contra uma chamada real nesta conta.**

**ACHADO IMPORTANTE da doc oficial**, citação literal: "All images used in TikTok Shop products
must be uploaded through this API. You will not be able to use any image URLs that are not hosted
by TikTok Shop." — ou seja, é **obrigatório** fazer upload primeiro; nunca dá pra usar a URL do
nosso R2 direto no payload de criação/edição de produto.

Resposta real (exemplo literal da doc):

```json
{
  "code": 0,
  "data": {
    "uri": "tos-maliva-i-o3syd03w52-us/c668cdf70b7f483c94dbe",
    "url": "https://p-oec-va.ibyteimg.com/tos-maliva-i-o3syd03w52-us/c668cdf70b7f483c94dbe",
    "height": 720,
    "width": 720,
    "use_case": "MAIN_IMAGE"
  },
  "message": "Success"
}
```

Usa-se o `uri` (não a `url` completa) no payload de criar/editar produto.

### 3. Update/Edit Product — dois endpoints distintos

**Achado importante**: existem dois caminhos separados pra atualizar um produto já criado, com
semânticas bem diferentes. **NÃO CONFIRMADO contra uma chamada real** em nenhum dos dois.

- **Edit Product completo**: `PUT /product/202309/products/{product_id}` (existe também uma
  versão `/product/202509/...`). Citação literal da doc: "All inputs, including blanks, in the
  request payload will overwrite existing values. To retain an unchanged value, you must include
  it in the request. [...] Exception for the price or inventory fields, which will remain
  unchanged if they are omitted from the request." — ou seja, é essencialmente um **full replace**
  (reenviar o produto inteiro), com exceção de preço/estoque, que só mudam se forem explicitamente
  enviados.
- **Partial Edit Product**: `POST /product/202509/products/{product_id}/partial_edit` — reparar
  que é **POST**, não PUT/PATCH apesar do nome, e usa a geração **202509** da API, diferente da
  202309 usada em quase tudo mais neste documento. Citação literal: "Updates are handled per
  top-level property [...] If you need to edit any nested property within an object, you must
  provide values for all nested properties of that object. Any omitted nested properties will be
  overwritten with blanks." — ou seja, o parcial só vale no **nível de campo de topo** (dá pra
  mandar só `description`, só `title`, isolados); um objeto aninhado (ex.: um item dentro de
  `skus[]`) precisa vir **completo**, senão os campos omitidos dele são zerados.
  - **Achado**: o corpo do Partial Edit não tem `category_id` na lista de propriedades aceitas —
    trocar a categoria de um produto parece exigir o Edit Product completo ou uma "Category
    Upgrade Task" separada (não pesquisado a fundo).
- Existem ainda endpoints dedicados **"Update Price"** (`POST /product/202309/products/prices/update`,
  payload não confirmado) e **"Update Inventory"** (esse já usado hoje pela integração de estoque —
  path confirmado em `tiktok.types.ts`, ver o "ACHADO REAL corrigido" da Fase 4 acima).

### 4. Get Categories

`GET /product/202309/categories`, query `locale`/`keyword`/`category_version`/`listing_platform`.
Doc avisa: "Product categories are updated frequently... Caching category data locally may result
in using outdated information." **Não temos um exemplo de resposta completo da doc** (só os
parâmetros foram vistos) — formato exato da lista devolvida ainda não confirmado. **NÃO
CONFIRMADO contra uma chamada real.**

### 5. Get Category Rules

`GET /product/202309/categories/{category_id}/rules` — requisitos extras da categoria
(certificações, size chart, dimensões obrigatórias, se aceita COD, pré-venda, etc.), usado como
referência cruzada dos campos condicionais do Create Product. Formato exato de resposta não
confirmado por um exemplo completo na doc. **NÃO CONFIRMADO contra uma chamada real.**

### 6. Get Attributes

`GET /product/202309/categories/{category_id}/attributes` — equivalente ao
`getCategoryAttributes` do Mercado Livre (ver `docs/integrations/mercado-livre.md` seção 2). **NÃO
CONFIRMADO contra uma chamada real nesta conta**, mas o exemplo abaixo é citação literal da doc:

```json
{
  "code": 0,
  "data": {
    "attributes": [
      {
        "id": "100392",
        "name": "Occasion",
        "type": "PRODUCT_PROPERTY",
        "is_requried": false,
        "values": [{ "id": "1001533", "name": "Birthday", "icon_url": "https://..." }],
        "value_data_format": "POSITIVE_INT_OR_DECIMAL",
        "is_customizable": true,
        "requirement_conditions": [{ "condition_type": "VALUE_ID_MATCH", "attribute_id": "101610" }]
      }
    ]
  }
}
```

**ACHADO**: reparar que a própria TikTok escreve `is_requried` (com erro de digitação, não é erro
nosso) no JSON de verdade — qualquer código que ler esse campo precisa aceitar as duas grafias.
`type` distingue atributo de propriedade do produto (`PRODUCT_PROPERTY`) de atributo de venda
(sales attribute, usado pra variação); `is_customizable` indica se aceita valor customizado
(`name`/`value_name` livre) além do catálogo fechado (`id`/`value_id`); `requirement_conditions`
mostra dependência entre atributos (um atributo só existe/é obrigatório dependendo do valor de
outro).

### 7. Get Warehouse List

`GET /logistics/202309/warehouses` — **atenção**: base path `/logistics/`, diferente de
`/product/` como o resto da API de produtos; escopo de app diferente (`seller.logistics`, não
`seller.product.*`) — precisa confirmar se o app tem essa permissão. `skus[].inventory[].warehouse_id`
é **obrigatório** no Create Product: "Retrieve the list of warehouses available for your shop from
the Get Warehouse List API." Pra categoria virtual, se passar um warehouse não-padrão a
plataforma ignora e usa o padrão mesmo assim. **NÃO CONFIRMADO contra uma chamada real** (inclusive
se o escopo `seller.logistics` já está liberado pro nosso Custom App).

### 8. Modelo SKU / atributo de venda (SPU/SKU)

Um produto (`product_id`) tem um array `skus[]`; cada SKU é uma combinação de valores de
`sales_attributes[]` (ex.: Cor=Vermelho + Tamanho=M). Cada item de `sales_attributes[]` é
`{id, value_id}` (built-in, vem do Get Attributes) OU `{name, value_name}` (customizado, só
permitido se `is_customizable` do atributo for `true` — a plataforma gera um id depois de
listado).

Regras vistas na doc:

- `id`/`name` e `value_id`/`value_name` únicos por SKU.
- Todos os SKUs do produto precisam ter os **mesmos tipos** de atributo (não pode um SKU só ter
  Cor e outro Cor+Tamanho).
- Máximo **3 tipos** de atributo de venda por produto.
- `sku_img` (imagem por variação) só pode ser atribuída a **1 tipo de atributo por produto** (o
  "principal", tipicamente cor) — precisa de uma imagem pra **cada** valor desse atributo (2 cores
  = 2 imagens).
- Preço (`price.amount`/`price.currency`) e estoque (`inventory[].warehouse_id`/`quantity`) são
  **por SKU**, não a nível de produto.
- `currency` aceita, entre outras: BRL, EUR, GBP, IDR, JPY, MXN, MYR, PHP, SGD, THB, USD, VND
  (confirmado na doc, embora ainda não testado contra uma chamada real).

Comparando com o Mercado Livre: é um modelo parecido com `variations[]` (seção 2 do
`mercado-livre.md`) — mas lá a variação exige `attribute_combinations` + `picture_ids` (referência
a fotos já existentes no item), enquanto aqui `sku_img` é uma imagem própria por valor do
atributo principal. **NÃO CONFIRMADO contra uma chamada real** em nenhum dos dois lados desta
comparação para o modelo TikTok.

### 9. Upload Product File (vídeo/PDF)

Já documentado antes nesta sessão: `POST /product/202309/files/upload`, multipart, campos
`data`+`name`, formatos de vídeo MP4/MOV/MKV/WMV/WEBM/AVI/3GP/FLV/MPEG até 100MB, PDF até 20MB.
**Complemento desta pesquisa**: o formato exato da **resposta** (nome do campo, tipo `video_id`
ou equivalente) ainda não foi confirmado por um exemplo real na doc — a página travou nesse ponto
durante a pesquisa. **NÃO CONFIRMADO contra uma chamada real.**

### 10. Duas gerações de API convivendo

Nota final: existem **duas gerações de API** para os dois endpoints de edição de produto
(`202309` e `202509` — ver seção 3 acima). A versão nova (`202509`) foi a que a pesquisa conseguiu
abrir com mais detalhe. Vale reconfirmar, numa sessão futura, se o restante da integração deveria
migrar pra essa versão mais nova em algum momento — isso está **fora do escopo** desta pesquisa,
que só cobriu os endpoints de publicação de produto.

### Resumo do que falta confirmar antes de implementar o envio automático

Nenhum item desta seção teve uma chamada real feita contra esta conta — tudo vem só da leitura da
documentação oficial. Antes de ligar o envio automático de produto `ACTIVE` pra TikTok Shop
(mesmo espírito do `TIKTOK_INVENTORY_PUSH_ENABLED` de estoque, sempre desligado por padrão até
confirmação real), os pontos mais críticos a validar com uma chamada de teste real são: formato
exato de `category_version`/árvore de categoria pra uma categoria BR real; se o escopo
`seller.logistics` (Get Warehouse List) já está liberado pro Custom App; comportamento real do
Partial Edit em `skus[]` aninhado; e o formato de resposta do Upload Product File.
