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

(Seção "Entregue nesta fase" preenchida ao final, após validação.)
