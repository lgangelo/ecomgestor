# Fase 4 — Simplificação Fiscal + Maturidade Gerencial e Operacional

**Status: plano escrito antes da implementação**, conforme instrução ("Antes de implementar
qualquer alteração, revise o código atual"). A seção final ("Entregue nesta fase") é preenchida
depois da implementação e validação.

## Estado atual (revisão feita antes de alterar código)

- **Fiscal**: `FiscalDocument` hoje trata XML como armazenamento permanente (`xmlPath`,
  `xmlSha256`, `xmlOriginalFilename`, `extractedData` sempre gravados em disco/JSON no upload).
  Só se relaciona com `Order`, nunca com `Return` diretamente (a devolução é inferida por
  `type === RETURN_INVOICE` no documento do pedido pai). Exportação é sempre por seleção manual
  de IDs — não existe exportação por mês. "Pendências" e o fechamento financeiro usam
  `Order.orderDate`, nunca `FiscalDocument.issueDate`.
- **Fechamento mensal**: `MonthlyClosing` é uma tabela plana de agregados financeiros
  (`orderDate`-based). Não existe checklist, snapshot de contadores fiscais/operacionais, nem
  distinção bloqueante/aviso.
- **Dashboard**: já tem comparação com período anterior (cards) e already tem
  `highestProfit`/`lowestMargin` (Fase 2). Não tem estoque parado, cobertura, sugestão de
  reposição, nem seção "precisa da sua atenção".
- **TikTok/Jobs**: push de estoque é 100% manual (`TikTokInventorySyncService.push`), nunca
  disparado por venda. Fila `integration` e `SyncJob` já existem (Fase 3) mas só expõem
  "falhas" — não há painel amplo por status/fila/período.
- **Notificações, busca global, command palette, filtros na URL**: nada disso existe.

## Plano de implementação (ordem A→H do pedido)

- **A — Fiscal**: `FiscalDocument` ganha `returnId`, `externalId`, `xmlAvailable`,
  `lastXmlCheckAt`; campos de armazenamento (`xmlPath`/`xmlSha256`/`xmlOriginalFilename`/
  `extractedData`) ficam mantidos e documentados como legado (usados só quando
  `XML_STORAGE_MODE=PERSIST`; default `REFERENCE_ONLY`). `FiscalDocumentProvider` vira uma
  interface real com um `ManualFiscalProvider` (lê do disco quando `PERSIST`) — nenhum provider
  de marketplace é implementado (TikTok confirmadamente não tem XML para buscar, ver
  `docs/integrations/tiktok.md`). Novo fluxo: preview por mês → ZIP sob demanda (gerado em
  memória, sem arquivo temporário em disco) com `manifest.csv` + `pendencias.csv` quando houver
  falha parcial. Regra temporal: tudo isso é filtrado por `issueDate`, nunca `orderDate`.
- **B — Fechamento**: checklist ao vivo (operacional/financeiro/fiscal, cada item com
  `severity: ok|warning`; nenhum item é bloqueante nesta fase — a especificação não define
  nenhuma condição de bloqueio real, só avisos), resumo de confirmação antes de fechar, snapshot
  de contadores (pedidos, devoluções, NF-e de venda/devolução, pendências fiscais, margem) —
  como colunas simples na tabela (não JSON, são escalares), reabertura já existente mantida.
- **C — Dashboard**: gráfico faturamento×resultado, canais com ticket/lucro/margem, ranking de
  produtos unificado (mantendo os campos antigos por compatibilidade), estoque parado, valor em
  estoque, cobertura, sugestão de reposição, seção "precisa da sua atenção".
- **D — Busca e navegação**: `GET /search` (Postgres simples, sem Elasticsearch) + busca no
  header + `Ctrl+K` (ações rápidas + resultados). Filtros na URL aplicados a Pedidos, Produtos e
  Fiscal (a nova tela por mês) e à nova tela de Jobs — as demais páginas listadas na seção 57
  (Estoque, Movimentações, Despesas, Auditoria) ficam para uma próxima passagem, documentado
  abaixo. Preset de período reutilizável, usado no Dashboard.
- **E — Notificações**: modelo novo, reconciliação periódica (job direto via `@Cron`, mesmo
  padrão do `RecurringExpenseSchedulerService` — sem fila nova), dedup por chave, resolução
  automática quando a condição some, sino no header.
- **F — Jobs**: painel ampliado (todos os status, não só falhas) reaproveitando `SyncJob`
  (Fase 3) sem mudança de schema. Sem renomear filas (seção 49 pede estabilidade).
- **G — Outbox de estoque**: em vez de instrumentar `InventoryLedgerService`/`OrdersService`/
  `ReturnsService` diretamente (o que acoplaria integração TikTok ao núcleo de estoque — o
  oposto do que a Fase 3 e o pedido desta fase quer preservar), o outbox é alimentado por um job
  periódico que reaproveita `TikTokInventorySyncService.compare()` (já existe) para detectar
  divergência e enfileirar push — decisão de design documentada abaixo. Continua 100% desligado
  por padrão (`TIKTOK_INVENTORY_PUSH_ENABLED=false` + toggle por empresa também desligado).
- **H — UX**: sidebar reorganizada (Jobs/Auditoria movidos para Configurações > Administração),
  onboarding checklist, simplificação da tela Fiscal e do Fechamento.

## Decisões de design que valem registrar

1. **Outbox via reconciliação, não via hook síncrono.** O pedido despacha o diagrama
   "InventoryLedgerService → Outbox" de forma direta, mas instrumentar isso exigiria tocar 5+
   call sites (`OrdersService`, `ReturnsService`, `InventoryService`, `StockEntriesService`,
   `InventoryCountService`) só para enfileirar um evento — e ainda assim o ledger continuaria
   sem saber nada de TikTok (ele já não sabe, de propósito). Em vez disso, um job periódico
   (curto, minutos) recalcula divergência via `compare()` — que já é a fonte de verdade usada na
   tela de comparação manual — e só then enfileira. A venda nunca espera a TikTok (seção 52
   continua satisfeita), ao custo de até alguns minutos de atraso na sincronização automática
   (aceitável: o push automático continua desligado por padrão nesta fase).
2. **Nenhum critério de fechamento é bloqueante.** A especificação não define nenhuma condição
   que impeça o fechamento — só pede para diferenciar bloqueante/aviso "quando aplicável". O
   tipo já suporta `blocking` para o futuro, mas nenhum item usa isso hoje.
3. **Filtros na URL**: aplicados a Pedidos, Produtos, Fiscal (nova) e Jobs (nova). Estoque,
   Movimentações, Despesas e Auditoria ficam para depois — decisão de escopo, não esquecimento.
4. **`XML_STORAGE_MODE=PERSIST`** é mantido só por compatibilidade com o fluxo de upload manual
   já existente; nenhuma funcionalidade nova é construída em cima dele.

## Entregue nesta fase (atualizado incrementalmente, por item)

### A — Fiscal

Já estava implementado antes desta passagem (schema, `FiscalDocumentProvider`/`ManualFiscalProvider`,
extração de XML, `GET /fiscal/monthly-summary` e `GET /fiscal/monthly-export` com ZIP em memória +
`manifest.csv`/pendências, regra temporal por `issueDate`). Validado nesta passagem via
`fiscal-temporal-rule.spec.ts` e `xml-extraction.util.spec.ts` (ambos verdes).

### B — Fechamento mensal (checklist + snapshot)

- Novo `apps/api/src/finance/monthly-closing-checklist.util.ts`: monta o checklist ao vivo
  (operacional/financeiro/fiscal) reaproveitando `FiscalService.getMonthlySummary` — nunca duplica
  a conta de documentos/XML pendentes que a tela Fiscal já calcula. Sinais usados:
  - Operacional: pedidos com `integrationSyncStatus` `REQUIRES_MAPPING`/`ERROR` no período
    ("pedidos conciliados"); devoluções ainda `REQUESTED`/`APPROVED` no período ("devoluções
    processadas"); `InventoryCount` com status `OPEN` ("estoque atualizado" — o ledger é síncrono
    por natureza, então o único sinal real de pendência é uma contagem física ainda aberta).
  - Financeiro: pedidos sem nenhum `MarketplaceFee` ("taxas conciliadas"); despesa recorrente ativa
    sem `Expense` materializada na competência do mês ("despesas cadastradas"); pedidos com
    `SettlementTransaction` em settlement `PENDING`/`PARTIALLY_SETTLED` (aviso extra "liquidação de
    repasses", seção 22 — não substitui nenhum dos 3 itens fixos). "Receitas processadas" fica
    sempre `ok`: não há um sinal de falha real para esse item sem inventar uma condição artificial
    (o agregado financeiro já inclui todo pedido não cancelado do período por construção).
  - Fiscal: reaproveita `saleInvoiceCount`/`returnInvoiceCount`/`xmlUnavailableCount` do resumo
    fiscal existente.
  - Nenhum item é bloqueante (decisão já registrada acima, seção "Decisões de design", item 2).
- `FinanceService.getMonthlyClosingPreview` (novo, `GET /finance/monthly-closings/:referenceMonth/preview`):
  calcula agregados + checklist sem persistir nada — usado pela tela para mostrar o checklist ao
  vivo e o resumo de confirmação antes de fechar (seção 25).
- `FinanceService.closeMonth`: agora grava o snapshot (seção 27) — `ordersCount`, `returnsCount`,
  `saleInvoiceCount`, `returnInvoiceCount`, `fiscalPendingCount` (escalares) e `warningsSnapshot`
  (JSON, só os itens em `warning`). `reopenClosing` já existia e não precisou mudar.
- `FinanceModule` passou a importar `FiscalModule` (sem ciclo — `FiscalModule` não depende de
  `FinanceModule`).
- Frontend: `MonthlyClosingView` reescrita com o layout Operacional/Financeiro/Fiscal/Resultado
  (seção 20), cada seção como checklist com ✓/⚠ (`monthly-closing-checklist.tsx`), botão "Fechar
  mês" abrindo `CloseMonthDialog` com o resumo de confirmação (seção 25) antes de chamar o close
  real, e o histórico de fechamentos passou a mostrar os contadores do snapshot e a badge de avisos
  registrada no momento do fechamento (não recalculada — é histórico).
- Testes novos: `monthly-closing-checklist.spec.ts` (3 casos — mês limpo, mês com todas as
  pendências, pluralização de contagem 1). `npm run lint`, `npm run test` (67/67) e `npm run build`
  passam nos dois workspaces; `prisma validate`/`prisma generate` seguem OK (schema não mudou).

**Limitação consciente (registrada aqui e no schema, `Company.allowNegativeStock`):** o campo
`allowNegativeStock` existe na configuração da empresa (seção 65) mas ainda não é lido pelo
`InventoryLedgerService` — mudar a validação de um componente já testado (concorrência, Fase 2)
por uma opção que por padrão é idêntica ao comportamento atual ficou fora do escopo desta
passagem. Isso também significa que o checklist "estoque atualizado" nunca vai detectar saldo
negativo por essa via (o ledger sempre rejeita), o que é esperado — o sinal real usado é a
contagem física em aberto, não saldo negativo.

**Ponto de atenção para o item D (busca/filtros na URL):** os links de aviso do checklist (ex.:
`/vendas/pedidos`, `/vendas/devolucoes`) apontam só para a página, sem query string de filtro —
as telas hoje não leem filtros da URL (isso é o próprio item D). Adicionar o filtro pré-aplicado
quando o item D existir é a continuação natural, não foi esquecido.

### C — Dashboard gerencial

- **Dashboard principal** (`ReportsService.getDashboard`, `apps/web/components/dashboard/*`):
  - Card novo "Receita líquida" (`cards.netRevenue = revenue - discounts - returnsAmount`); "Lucro
    estimado"/"Margem" passam a partir da receita líquida (antes ignoravam desconto/devolução,
    o que superestimava o lucro).
  - Gráfico principal único "Faturamento x Resultado" (seção 30) — substitui os dois gráficos
    separados de faturamento e de contagem de pedidos por período por um só (`ComposedChart`:
    área de faturamento + linha de resultado), reduzindo o número de gráficos na tela principal
    (seção 62). Agrupa por dia quando o período tem até 45 dias, por semana ISO acima disso
    (`isoWeekKey`) — evita um gráfico ilegível em períodos longos.
  - "Vendas por canal" ganhou tabela de detalhe (pedidos/ticket médio/lucro/margem/participação
    %) além da pizza existente.
  - Ranking de produtos unificado (`charts.products`, até 50 itens) com alternância cliente-side
    Mais vendidos/Maior lucro/Menor margem (seção 32) — os cortes antigos (`topProducts`,
    `marginByProduct`, `highestProfit`, `lowestMargin`) foram mantidos intactos no backend por
    compatibilidade (também usados por `reports-view.tsx`/Relatórios, que não foi alterado).
  - Nova seção "Precisa da sua atenção" (seção 63): `ReportsService.computeAttention` — estoque
    baixo, documentos fiscais pendentes (reaproveita `FiscalService.getPending`), falhas de
    sincronização TikTok (`SyncJob` `FAILED`) e pedidos com `integrationSyncStatus`
    `REQUIRES_MAPPING`; cada item só aparece com contagem > 0 e é clicável. Substituiu o
    `AlertsPanel` só na tela de Dashboard — `AlertsPanel` continua existindo e sendo usado em
    `reports-view.tsx` (Relatórios), que não foi tocado nesta passagem.
- **Estoque** (`InventoryService.getInsights`, `apps/web/components/inventory/inventory-insights.tsx`):
  novo `GET /inventory/insights` com "Estoque parado" (seção 33 — sem venda há mais de
  `Company.slowMovingDays` dias, incluindo nunca vendido) e "Reposição sugerida" (seção 36 —
  disponível ≤ mínimo OU cobertura < `Company.restockCoverageDays`). Cobertura (seção 35) =
  disponível ÷ (unidades vendidas nos últimos 30 dias ÷ 30); sem venda recente vira "Sem dados
  suficientes" em vez de inventar uma previsão. "Última venda"/"vendido em 30 dias" vêm de uma
  única consulta SQL agregada (`$queryRaw` com `Prisma.sql`, parametrizada) — o Prisma não
  expressa MAX/SUM de uma coluna da tabela relacionada (`orders.order_date`) agrupado pela FK
  (`order_items.variant_id`) em uma única chamada tipada.
- Testes novos: `reports-dashboard.spec.ts` (4 casos: receita líquida/lucro, canais, "precisa de
  atenção" só com contagem > 0, bucket semanal ISO) e `inventory-insights.spec.ts` (2 casos:
  estoque parado e reposição sugerida). `lint`, `test` (73/73) e `build` OK nos dois workspaces.

**Não testado em navegador real**: como no ambiente de controle não há Postgres/Docker disponível
(mesma limitação documentada em `docs/phase2-review.md`), a validação desta passagem ficou em
type-check + lint + testes unitários + build, não em uma sessão de navegador com dados reais.

### Correção ao Item A — frontend do fluxo mensal não estava ligado

Ao mexer no item D descobri que o backend do fluxo mensal (seção 9-16: preview + ZIP sob
demanda) estava pronto desde antes, mas a tela `/fiscal/exportacao` (`FiscalExportView`) **nunca
foi atualizada para usá-lo** — ela continuava com o fluxo antigo (intervalo de datas + seleção
manual de checkboxes + `POST /fiscal/documents/export` por IDs). Ou seja, o botão "Baixar XMLs
para contabilidade" que referenciei nos itens B e C levava para uma tela que não fazia preview
por mês nem mostrava pendências. Corrigido nesta passagem:

- Novos hooks `useFiscalMonthlySummary`/`useDownloadMonthlyFiscalExport` em `use-fiscal.ts`,
  usando os endpoints que já existiam (`GET /fiscal/monthly-summary`, `GET /fiscal/monthly-export`).
- `FiscalExportView` reescrita: seletor de mês + canal, cards de preview (documentos emitidos,
  NF-e de venda/devolução, XML disponível — seção 12), aviso claro quando há pendências (nunca
  finge que o pacote está completo — seção 12/14) e botão único de download.
- O fluxo antigo por seleção de IDs (`useExportFiscalDocuments`, `POST /fiscal/documents/export`)
  continua existindo só na tela `/fiscal` (lista completa de documentos) como ação secundária —
  não foi removido, é o fallback mencionado na seção 18.

### D — Busca global e filtros na URL

- **`useUrlFilters` (`apps/web/hooks/use-url-filters.ts`)**: hook reutilizável que lê/escreve
  filtros e paginação na query string (`useSearchParams`/`router.replace`, sem reload) — só grava
  na URL o que diverge do default (seção 58: nunca serializa objeto inteiro). Aplicado em:
  - **Pedidos** (`OrdersView`) — inclui novo filtro `syncStatus` (adicionado a `QueryOrdersDto`/
    `orders.service.ts`), o que também tornou reais os links "N pedidos precisam de atenção" do
    checklist de fechamento (item B) e da seção "precisa da sua atenção" do dashboard (item C) —
    antes apontavam só para a lista, sem filtro; agora `/vendas/pedidos?syncStatus=REQUIRES_MAPPING`
    filtra de fato.
  - **Produtos** (`ProductsView`) — busca/categoria/status/página.
  - **Fiscal** — status/página na lista (`/fiscal`) e mês/canal na tela de exportação
    (`/fiscal/exportacao`, "a nova tela por mês" citada no plano original).
  - **Jobs**: adiado — a tela ainda não existe (é o item F); os filtros entram junto quando ela
    for criada, não faz sentido persistir filtro de uma tela inexistente.
  - Estoque, Movimentações, Despesas e Auditoria continuam fora do escopo desta passagem (decisão
    já registrada no plano original, não esquecimento).
- **Preset de período reutilizável (seção 59)**: `apps/web/lib/period-presets.ts` +
  `PeriodFilterBar` — Hoje/Últimos 7 dias/Últimos 30 dias/Este mês/Mês anterior/Personalizado.
  Como `PeriodFilterBar` já era compartilhado entre Dashboard e Relatórios, os dois ganharam o
  preset sem precisar tocar em `reports-view.tsx`.
- **Busca global (seções 37-39)**: `GET /search` (`apps/api/src/search/`) — PostgreSQL simples via
  Prisma (`contains`/`insensitive`), sem Elasticsearch. Busca pedido interno (id), pedido externo
  (`externalOrderId`), cliente, produto/SKU e NF-e (número/chave de acesso). Cada seção do
  resultado (pedidos/produtos/documentos fiscais) só é preenchida quando o usuário tem a
  permissão de leitura do domínio correspondente (`ORDER_READ`/`PRODUCT_READ`/`FISCAL_READ`) —
  a busca nunca revela a existência de dados de um domínio que o usuário não pode ver em suas
  próprias telas. Limite de 5 resultados por seção, mínimo de 2 caracteres
  (`SearchQueryDto`/`SEARCH_MIN_LENGTH`), debounce de 300ms no cliente (`useDebouncedValue`) —
  nenhuma query pesada por tecla isolada. Isolamento por `companyId` coberto em
  `search.spec.ts`.
- **Header + Ctrl+K (seção 37/40)**: `GlobalSearch` (busca inline no header, dropdown agrupado
  Pedidos/Produtos/Documentos fiscais) e `CommandPalette` (Ctrl+K/Cmd+K, montado em `AppShell`,
  navegação por teclado ↑/↓/Enter) reaproveitam a mesma infraestrutura (`useGlobalSearch`,
  `SearchResultGroups`). Ações rápidas do Ctrl+K (Nova venda, Nova entrada, Novo produto, Ajustar
  estoque, Fechamento mensal, Abrir TikTok) só aparecem quando o usuário tem a permissão
  correspondente.
- Testes novos: `search.spec.ts` (3 casos — isolamento por empresa, filtragem por permissão,
  busca por cada tipo de entidade). `lint`, `test` (76/76) e `build` OK nos dois workspaces.

### E — Notificações internas

- **Reconciliação periódica** (`apps/api/src/notifications/notifications.service.ts`,
  `NotificationsSchedulerService` a cada 10 minutos via `@Cron`, mesmo padrão do
  `RecurringExpenseSchedulerService` — sem fila BullMQ nova, conforme já decidido no plano):
  avalia 5 condições reaproveitando sinais que já existem em outros pontos do sistema (nunca uma
  segunda fonte de verdade para "estoque baixo" ou "pendência fiscal"):
  - **ESTOQUE** — produtos abaixo do estoque mínimo (mesmo cálculo do dashboard).
  - **FISCAL** — vendas sem NF-e associada (`FiscalService.getPending`).
  - **INTEGRACAO** — jobs `FAILED` da integração TikTok; e pedidos com `integrationSyncStatus`
    `REQUIRES_MAPPING` ("produtos TikTok sem vínculo").
  - **FINANCEIRO** — fechamento do mês corrente com avisos pendentes (reaproveita
    `buildMonthlyClosingChecklist`, item B) — só é avaliado enquanto o período está aberto; uma
    vez fechado, a condição é tratada como resolvida (sem recalcular o checklist), para nunca
    deixar uma notificação órfã depois que o usuário já fechou o mês.
  - Cada condição tem uma `dedupeKey` fixa (ou parametrizada por mês, no caso do fechamento) e o
    upsert usa a constraint única `(companyId, dedupeKey)` (seção 43) — nunca cria uma segunda
    notificação para a mesma condição; quando a condição para de ser verdadeira, marca
    `resolvedAt` automaticamente.
- **API** (`GET /notifications`, `GET /notifications/unread-count`, `PATCH /notifications/:id/read`,
  `POST /notifications/read-all`) — sem `@RequirePermissions`, mesmo padrão da busca global:
  é a caixa de entrada pessoal de qualquer usuário autenticado da empresa.
- **Frontend**: `NotificationBell` no header (sino com contador, atualizado a cada 60s), painel
  com abas "Não lidas"/"Todas" (seção 44), cada item com categoria (badge), marca como lida ao
  clicar e navega para o link. Nenhum e-mail/push/WhatsApp implementado (fora de escopo desta
  fase, seção 44).
- Testes novos: `notifications.spec.ts` (5 casos — cria via upsert nunca duplicando, resolve
  automaticamente, mesma dedupeKey em execuções repetidas, fechamento aberto gera aviso,
  fechamento já fechado nunca recalcula o checklist e resolve notificação anterior). Usa
  `jest.mock` sobre `buildMonthlyClosingChecklist` para isolar do restante das dependências do
  checklist (já cobertas em `monthly-closing-checklist.spec.ts`). `lint`, `test` (81/81) e
  `build` OK nos dois workspaces.

### F — Painel de jobs

- **Backend** (`apps/api/src/jobs/`, novo módulo): `GET /jobs` (paginado, filtros
  status/tipo/período), `GET /jobs/:id`, `POST /jobs/:id/retry` — reaproveita o modelo `SyncJob`
  já existente da Fase 3 sem nenhuma mudança de schema (seção 49). Vocabulário de status real
  (`PENDING`/`RUNNING`/`COMPLETED`/`FAILED`) — nunca o `WAITING`/`ACTIVE`/`DELAYED` imaginado na
  redação original da seção 46, que não corresponde a como o `SyncJob` é gravado hoje. "Fila"
  ainda não é um filtro real: toda fila que grava `SyncJob` hoje é a fila `integration` (só existe
  uma) — vira filtro de verdade quando uma segunda fila também passar a rastrear jobs neste
  modelo. Detalhe do job nunca inclui `payload` bruto (seção 47 — pode conter token/segredo).
- **Retry consolidado**: o dispatch de reenfileiro por tipo de job (que só existia dentro de
  `TikTokController`, usado pela aba de falhas da Fase 3) foi movido para
  `TikTokJobsService.retryAndRequeue` — agora tanto a aba de falhas do TikTok quanto o painel
  geral de Jobs chamam o mesmo método, nunca duas cópias do mesmo switch por tipo de job.
  `JobsModule` importa `TikTokModule` só para reaproveitar isso (hoje todo `SyncJob` é um job
  TikTok).
- **Frontend**: `/configuracoes/jobs` (`JobsView`) — filtros na URL (status/tipo/período, seção
  57), tabela com Fila/Job/Status/Criado/Iniciado/Finalizado/Tentativas/Duração, linha expansível
  com detalhe seguro, botão "Tentar novamente" só para jobs `FAILED`.
- **Correção de bug de UX encontrada nesta passagem**: o grupo "Configurações" da sidebar exigia
  a permissão do próprio grupo (`settings.manage`) para aparecer, mesmo que o usuário tivesse a
  permissão de um item individual dentro dele — um `MANAGER` com `audit.read` (mas sem
  `settings.manage`) nunca via "Auditoria", e não veria "Jobs" (`integration.jobs.read`) pelo
  mesmo motivo. Corrigido em `sidebar-nav.tsx`: um grupo agora aparece se o usuário tem a
  permissão do grupo OU de pelo menos um item dentro dele — nunca esconde algo que o usuário já
  tinha permissão de ver.
- Testes novos: `jobs.spec.ts` (5 casos — isolamento por empresa, filtro por status, payload
  nunca exposto, retry recusado fora de `FAILED`, retry aciona o reprocessamento).
  `tiktok-jobs.service.spec.ts` ajustado para a nova dependência do construtor. `lint`, `test`
  (86/86) e `build` OK nos dois workspaces.

### G — Outbox de estoque multicanal

- **`TikTokStockOutboxService`** (`apps/api/src/integrations/tiktok/tiktok-stock-outbox.service.ts`):
  - `reconcile(companyId)` — reaproveita `TikTokInventorySyncService.compare()` (mesma fonte da
    tela de comparação manual) para detectar divergência; nunca instrumenta
    `InventoryLedgerService`/`OrdersService`/`ReturnsService` diretamente (decisão já registrada
    acima). Uma divergência nova para o mesmo (variantId, channelId) atualiza a entrada `PENDING`
    existente em vez de criar uma segunda linha (seção 53 — coalescing: só o valor final
    importa). Quando a divergência já não existe mais (ex.: alguém enviou manualmente), a entrada
    `PENDING` correspondente vira `SYNCED` — nunca envia um valor que já não reflete a realidade.
  - `processPending(companyId)` — só envia de verdade quando a flag global
    (`TIKTOK_INVENTORY_PUSH_ENABLED`) **E** o novo toggle por empresa
    (`Company.inventoryAutoSyncEnabled`, default `false`) estão ligados; sem qualquer um dos dois,
    o outbox só acumula (fica visível na tela de divergência), nunca envia sozinho. Reaproveita
    `TikTokInventorySyncService.push()` (agora aceita `userId: string | null` — `null` identifica
    disparo automático no audit log) para reler o estoque central na hora do envio, nunca
    confiando cegamente no valor capturado quando a divergência foi detectada.
  - `getStatusReport(companyId)` — junta `compare()` (verdade ao vivo) com a entrada mais recente
    do outbox por variante para produzir os 4 estados da seção 54 (`OK`/`PENDENTE`/`DIVERGENTE`/
    `ERRO`), sem inventar um estado que o outbox não registrou.
  - Job periódico a cada 5 minutos (`TikTokStockOutboxSchedulerService`, `@Cron`) roda
    `reconcile` + `processPending` para todas as empresas — nunca no caminho da venda (seção 52:
    commit interno sempre primeiro, sync externo sempre assíncrono).
- **`GET /integrations/tiktok/inventory/compare`** passou a retornar o relatório de status
  (`getStatusReport`) em vez do `compare()` cru — a tela de divergência (já existente da Fase 3)
  ganhou as colunas "Diferença", "Último sync" e os 4 estados sem precisar de endpoint novo.
- **Configurações da empresa**: `PATCH /company` (endpoint já existente, só estava incompleto)
  passou a aceitar `currency`, `slowMovingDays`, `restockCoverageDays` e
  `inventoryAutoSyncEnabled` — os três primeiros já existiam no schema desde o início da Fase 4
  mas nunca tinham sido conectados a este endpoint (adiantei essa parte do item H, seção 65,
  porque já estava mexendo neste arquivo exatamente para o toggle de auto-sync). `allowNegativeStock`
  ficou de fora deliberadamente: o campo existe no schema mas o `InventoryLedgerService` ainda não
  o lê (limitação já documentada) — expor um toggle sem efeito nenhum seria pior do que não
  expor; decisão a reavaliar quando a tela de Configurações completa for revisada no item H.
  Tela `/configuracoes/empresa` ganhou os campos correspondentes e o toggle "Sincronização
  automática de estoque" com o aviso da seção 56.
- Testes novos: `tiktok-stock-outbox.spec.ts` (7 casos — sem integração conectada, criação de
  entrada nova, coalescing, resolução automática, os dois gates de `processPending` isolados, e
  sucesso/falha por entrada). `lint`, `test` (93/93) e `build` OK nos dois workspaces;
  `prisma validate`/`generate` OK após a migração de schema (`inventoryAutoSyncEnabled`).

### H — UX e onboarding

- **Feedback específico de ações (seção 60)**: os dois exemplos citados no pedido foram
  corrigidos — registrar venda (`Venda registrada. / Pedido TT-123456 — estoque reservado.`) e
  confirmar entrada de estoque (`Entrada registrada com sucesso. / Estoque atualizado: +24
  SKU-VIE-PRE. Novo custo: R$ 71,30.`, ou a versão agregada quando a entrada tem vários itens).
  Também corrigido o ajuste manual de estoque (`Movimentação registrada com sucesso. / Estoque
  atualizado para N unidades (M disponíveis).`). Não foi feita uma auditoria de **todos** os
  toasts do sistema — só os citados explicitamente no pedido mais o de maior tráfego (ajuste de
  estoque); os demais continuam com o padrão anterior.
- **Navegação (seção 61)**: a ordem sugerida (Dashboard/Vendas/Produtos/Financeiro/Fiscal/
  Relatórios/Integrações/Configurações) já é a ordem atual da sidebar — nenhuma mudança
  necessária além do que o item F já fez (Jobs movido para Configurações). Categorias,
  Movimentações, Taxas, Receitas, Canais, Shopee e Mercado Livre foram mantidos como itens
  próprios: são páginas funcionais reais, não "técnicas", e removê-las seria regressivo sem
  ganho claro — a sugestão da seção 61 é uma sugestão, não uma lista fechada.
- **Onboarding (seção 64)**: novo `GET /onboarding/status` (`apps/api/src/onboarding/`) — 5
  passos (empresa configurada, primeiro produto, primeira entrada de estoque, impostos
  estimados, TikTok Shop conectada), cada um checado por uma condição real (nunca um estado
  fake). `OnboardingChecklist` no topo do Dashboard: barra de progresso, links diretos para cada
  passo pendente, nunca bloqueia o uso do sistema, desaparece sozinho quando os 5 estão
  concluídos, e "ocultar" é uma preferência só do navegador (`localStorage`) — não precisou de
  campo novo no schema.
- **Configuração da empresa (seção 65)**: adiantada no item G (toggle de auto-sync já exigia
  mexer neste mesmo arquivo) — `currency`, `slowMovingDays`, `restockCoverageDays` e
  `inventoryAutoSyncEnabled` ganharam campos no formulário de Configurações → Empresa.
  `allowNegativeStock` continua fora do formulário (limitação consciente, ver item G).
- **Simplificação do financeiro (seção 66)**: nada a remover — o sistema nunca teve contas
  bancárias complexas, conciliação bancária ou plano de contas contábil; a tela Financeiro já era
  só "quanto vendeu/custou/pagou de taxa/gastou/sobrou/tem a receber" desde as fases anteriores.
- **Redução de complexidade visual (seção 62)**: aplicada pontualmente durante esta fase onde fazia
  sentido (fiscal por mês em vez de lista de upload em destaque — item A/D; um gráfico principal em
  vez de dois no dashboard — item C), não como uma auditoria separada de todas as telas.
- Testes novos: `onboarding.spec.ts` (3 casos — nenhum passo concluído, todos concluídos,
  integração desconectada não conta). `lint`, `test` (96/96) e `build` OK nos dois workspaces.

## Fechamento da Fase 4

Todos os itens A→H do plano foram implementados e validados nesta passagem. Resumo do que foi
**simplificado**: módulo fiscal (referência + download sob demanda, upload como ação secundária),
tela de fechamento mensal (checklist + resumo antes de confirmar), dashboard (um gráfico principal
em vez de vários, ranking de produtos unificado). **Removido**: nada foi removido — toda mudança
foi aditiva ou uma correção de uma peça que já existia mas não estava conectada (ver as duas
seções "Correção" acima, no início do item D e no item A). **Mantido por compatibilidade**:
`xmlPath`/`xmlSha256`/`xmlOriginalFilename`/`extractedData` em `FiscalDocument` (modo `PERSIST`,
legado); os cortes antigos de produtos do dashboard (`topProducts`/`marginByProduct`/
`highestProfit`/`lowestMargin`), ainda usados por `reports-view.tsx`. **Schema**: `FiscalDocument`
(seção A), `MonthlyClosing` (snapshot, seção B), `Notification` (seção E), `StockSyncOutboxEntry`
(seção G) e `Company.inventoryAutoSyncEnabled` (seção G) — nenhuma migration destrutiva.

Testes: suíte da API foi de 15 (início da Fase 4) para 96 testes, todos verdes. `lint`, `build` e
`prisma validate`/`generate` passam nos dois workspaces em todas as passagens.

Critério de sucesso (seção 83 do pedido original): o usuário consegue abrir o dashboard e
responder em poucos segundos quanto vendeu, quanto lucrou, qual canal/produto performa melhor, o
que está com estoque baixo/parado, se há pendência (fiscal, fechamento, TikTok) e baixar os XMLs
do mês — tudo isso está implementado e coberto por teste, mas **não foi validado em um navegador
com dados reais**: o ambiente de controle não tem Postgres/Docker disponível (mesma limitação já
registrada em `docs/phase2-review.md` e `README.md`). Recomenda-se uma sessão de validação manual
na VM de destino antes de considerar a fase encerrada para produção.
