# Fase 2 — Revisão inicial e plano de execução

Leitura completa realizada em: `packages/database/prisma/schema.prisma`, `apps/api/src/**` (todos os
módulos), `apps/web/**` (hooks, componentes, páginas), testes existentes, `README.md`.

## O que já existe (Fase 1 — fundação)

- Monorepo npm workspaces, Next.js 14 + NestJS 10 + Prisma + PostgreSQL externo + Redis + BullMQ +
  Traefik, tudo validado (build/lint/testes limpos).
- Auth completo (Argon2id, JWT+refresh, CSRF, rate limit, brute force), RBAC granular por permissão,
  auditoria (`audit_logs` + `AuditService.log`), logs estruturados sanitizados.
- Schema com 30 tabelas cobrindo empresa, RBAC, canais/integrações, catálogo, fornecedores/estoque,
  pedidos, repasses/taxas, devoluções/reembolsos, financeiro, fiscal, fechamento, auditoria.
- Módulos de API funcionais: categories, products, suppliers, inventory (+ stock-entries), channels,
  orders (+ returns), finance, fiscal, reports, integrations, company, users, roles, audit.
- Frontend com todas as telas de navegação da Fase 1, React Query, shadcn/ui próprio, tema light/dark.
- Testes: unitários (guards, sanitização) + e2e da cadeia de guards. Nenhum teste de regra de negócio
  ainda (estoque, custo, financeiro) — gap identificado nesta revisão.

## Problemas / gaps identificados (o que a Fase 2 precisa corrigir)

1. **Estoque sem `on_hand` explícito.** `Inventory` só tem `available`/`reserved`; a regra
   `available = on_hand - reserved` (seção 9) não pode ser expressa porque não existe o saldo físico
   total separado da reserva. Precisa migrar `available` → `onHand`, e `available` passa a ser
   **computado** (nunca armazenado) nas respostas da API.
2. **Ledger de estoque incompleto.** `InventoryMovement` tem `reference` (string única) e não guarda
   snapshot de antes/depois (`previous_on_hand`, `new_on_hand`, `previous_reserved`,
   `new_reserved`) nem `reason` estruturado — pedido explícito da seção 10.
3. **Concorrência não tratada.** `inventory.service.ts` e `orders.service.ts` fazem
   *read-then-write* (`findFirst` seguido de `update` com o valor calculado em memória) — duas
   requisições simultâneas podem ler o mesmo saldo e ambas decrementarem, gerando estoque negativo
   (exatamente o cenário da seção 56). Precisa de escrita atômica (compare-and-swap) centralizada.
4. **Sem rateio de custo na entrada.** `StockEntry`/`StockEntryItem` não têm frete/outras despesas
   nem método de rateio; o custo do item é só o valor informado na nota (seção 5-6).
5. **Sem snapshot de venda no item do pedido.** `OrderItem` não grava nome/SKU no momento da venda
   nem separa desconto do vendedor/plataforma/frete/taxa (seção 8) — mudanças futuras no cadastro do
   produto afetariam a leitura de pedidos antigos (ex: renomear produto muda o histórico).
6. **Venda manual sempre dá baixa direta (`SALE`), nunca reserva.** Não existe reserva ao criar
   pedido em status `CREATED`/`PAID`; a baixa (`onHand -= qty`) acontece na criação, independente do
   status. Viola a seção 15 (reserva até confirmação/envio).
7. **Sem máquina de estados do pedido.** `updateStatus` aceita qualquer transição livremente — não há
   tabela de transições válidas (seção 14), nem efeito de estoque acoplado à transição.
8. **Cancelamento não distinto de devolução.** Cancelar um pedido hoje só troca o `status`; não há
   lógica que decida se deve liberar reserva (pré-envio) ou exigir decisão explícita sobre retorno
   físico (pós-envio) — seção 17.
9. **`ReturnItem.condition` é texto livre**, sem enum `NOVO/USADO/DANIFICADO/PERDIDO`, e não existe
   flag `retorna ao estoque?` — a devolução nunca gera movimentação `RETURN` de fato (seção 18).
10. **`Refund` não distingue `FULL`/`PARTIAL`** como campo estruturado (seção 19).
11. **Sem inventário físico** (`InventoryCount`) — seção 12.
12. **Sem ajuste manual com motivo obrigatório na UI** — o backend já aceita `note` opcional; falta
    tornar `reason` obrigatório e distinto de observação livre (seção 11).
13. **Despesas sem competência/status/recorrência** — `Expense` só tem uma data e nenhum status
    (seção 22-23).
14. **Imposto estimado hardcoded no frontend/backend** (não existe) — precisa de
    `TaxConfiguration` com vigência (seção 29). Hoje o DRE usa a soma da categoria "Impostos" como
    proxy, o que é razoável para despesas reais, mas não cobre "estimativa configurável" pedida.
15. **Fiscal só gera XML mock**, não aceita upload real, não valida duplicidade por hash, não
    extrai dados do XML, não exporta CSV/manifest (seções 30-37, 40).
16. **Fechamento mensal não bloqueia edição do período** nem tem fluxo de reabertura com motivo
    auditado (seção 38-39).
17. **Dashboard já é 100% real** (sem mocks) — construído assim desde a Fase 1. Falta apenas
    comparação de período (já implementada!) revisão de edge cases de divisão por zero (já tratada)
    e os cortes "maior lucro"/"menor margem" (seção 26) — pequeno complemento.
18. **Paginação já é server-side** em todas as listagens grandes (Fase 1). **Falta refletir filtros
    na URL** (seção 64) — hoje vive em `useState` do React, perdido ao recarregar a página.
19. **Sem busca global / command palette** (seções 42-43) — não existe ainda.
20. **Sem notificações internas centralizadas** (seção 44) — hoje os alertas só existem dentro do
    dashboard.
21. **Sem arquitetura de conector de marketplace tipada** (seção 45) — `packages/integrations` hoje é
    só um placeholder vazio.
22. **TikTok**: nenhuma implementação ainda, corretamente — a Fase 1 não deveria ter feito isso.

## Decisão de schema

Sem PostgreSQL disponível nesta máquina de controle (mesma limitação da Fase 1), não é possível gerar
migrations incrementais reais via `prisma migrate dev`. Para não editar o schema em dezenas de
passadas isoladas, as mudanças de modelo de dados de **todas** as fases A–F foram aplicadas em uma
única evolução do `schema.prisma` (validada com `prisma validate`/`generate`), listada abaixo.
`prisma migrate dev` continua pendente de um ambiente com banco real — ver aviso no `README.md`.

## Plano de execução (mesma ordem pedida)

| Fase | Conteúdo | Status nesta entrega |
| --- | --- | --- |
| A | Produto mestre, abas do produto, entrada com rateio de custo, histórico de custo | Implementado |
| B | `on_hand`/`reserved`/`available`, ledger completo, ajuste manual, inventário físico, concorrência (CAS) | Implementado |
| C | Máquina de estados do pedido, venda manual real (reserva → baixa), snapshot de venda | Implementado |
| D | Cancelamento por estágio, devolução completa (condição/retorno), refund FULL/PARTIAL | Implementado |
| E | Financeiro centralizado no backend, impostos configuráveis, despesas com competência/recorrência, dashboard (cortes adicionais) | Implementado |
| F | Fiscal: upload real de XML, extração básica, associação automática/manual, exportação ZIP+manifest, pendências | Implementado |
| G | Arquitetura de integração tipada (`MarketplaceConnector`) | Implementado (contrato apenas); filas nomeadas por domínio e dashboard de jobs **não** implementados nesta passagem |
| H | TikTok Shop | **Não iniciado** — depende de pesquisa da documentação oficial (seção 46), fora do escopo desta entrega para não "inventar endpoint"; checklist de pesquisa criado em `docs/integrations/tiktok.md` |

## Entregues nesta passagem — detalhamento real

### Schema (uma única evolução, ver `packages/database/prisma/schema.prisma`)
`Inventory.onHand` substitui `available` (computado sempre em código);
`InventoryMovement` com snapshot completo (`previous/new` onHand/reserved, `referenceType`,
`referenceId`, `reason`); `StockEntry`/`StockEntryItem` com `shippingCost`/`otherCosts`/
`allocationMethod`/`effectiveUnitCost`; `InventoryCount`/`InventoryCountItem` (inventário
físico); `OrderItem` com snapshot completo de venda (nome/SKU no momento, seller/platform
discount, shipping/marketplace fee); `ReturnItem.condition` como enum + `restockOnReturn`;
`Refund.type` (FULL/PARTIAL); `Expense` com `competenceDate`/`status`/`isRecurring`;
`RecurringExpenseTemplate`; `TaxConfiguration`; `FiscalDocument` com `xmlSha256`/
`xmlOriginalFilename`/`extractedData`/`sourceType`; `MonthlyClosing` com rastro de reabertura.

### Backend
- `InventoryLedgerService` (`apps/api/src/inventory/ledger.service.ts`) — única porta de
  escrita de estoque, com compare-and-swap atômico e retry; testado com concorrência simulada
  (`ledger.service.spec.ts`, seção 56).
- Rateio de custo determinístico (`cost-allocation.util.ts`, testado) — por valor ou por
  quantidade, sem resto de arredondamento perdido.
- Máquina de estados do pedido centralizada (`order-state-machine.ts`, testada) — toda
  transição de status (manual ou via devolução/reembolso) passa por ela.
- Venda manual e pedidos reservam estoque até o envio, só baixam de fato em `SHIPPED`.
- Cancelamento pré-envio libera reserva; pós-envio não mexe em estoque automaticamente.
- Devolução com condição do item (enum) e decisão explícita de retorno ao estoque; reembolso
  como entidade própria (FULL/PARTIAL), nunca gera movimentação de estoque por si só.
- Financeiro: agregações centralizadas no backend (nada de regra financeira só no frontend),
  imposto estimado via `TaxConfiguration` vigente (nunca hardcoded), despesas com
  competência/status, despesas recorrentes materializadas por job diário idempotente,
  fechamento mensal bloqueia edições do período e exige motivo para reabrir (auditado).
- Fiscal: upload real de XML (valida MIME/extensão/tamanho/conteúdo, bloqueia duplicidade por
  SHA-256, extrai campos básicos por regex, tenta associação automática por valor+data,
  associação manual quando ambíguo), exportação ZIP organizada em `vendas/`/`devolucoes/`/
  `outros/` com `manifest.csv`, painel de pendências fiscais.
- Exportação de vendas em CSV (`GET /reports/sales-export`).
- Cortes adicionais no dashboard: maior lucro e menor margem por produto.
- Testes novos: `cost-allocation.util.spec.ts`, `order-state-machine.spec.ts`,
  `ledger.service.spec.ts` (concorrência), `xml-extraction.util.spec.ts` — 19 testes novos,
  27 testes unitários + 7 e2e no total, todos passando.

### Frontend
- Página de produto com abas (Resumo/Estoque/Custos/Vendas/Canais/Histórico).
- Entrada de estoque com campos de frete/outras despesas/método de rateio e custo efetivo
  exibido por item.
- Ajuste de estoque com motivo obrigatório.
- Devolução com condição por item e decisão de retorno ao estoque; ação de reembolso.
- Upload de XML fiscal, associação manual, painel de pendências fiscais.
- Despesas com abas de lançamentos / recorrentes / impostos estimados; reabertura de
  fechamento mensal com motivo.

### Não entregue nesta passagem (ficou de fora conscientemente)
Busca global e command palette (seções 42-43); notificações internas centralizadas além dos
alertas do dashboard (seção 44); filtros refletidos na URL (seção 64); filas BullMQ nomeadas
por domínio e dashboard de jobs (seções 53-54); TikTok Shop (seção 45-52, corretamente fora de
escopo). Recomenda-se tratar esses itens em uma próxima iteração, na mesma ordem de prioridade
já usada aqui (regras internas antes de UX transversal antes de integrações externas).

### Validação executada
`npm run build` (limpo, do zero, 8 workspaces) · `npm run lint` (zero erros em todos os
workspaces) · `npm run test` (27/27) · `npm run test:e2e --workspace=@ecommerce-manager/api`
(7/7) · `prisma validate`/`generate` (schema válido). `prisma migrate dev` contra um banco real
continua pendente pela mesma limitação da Fase 1 (sem PostgreSQL nesta máquina de controle).
