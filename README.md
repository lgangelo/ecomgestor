# E-commerce Manager

Centro de controle de vendas, produtos, estoque, custos, lucratividade e documentos fiscais para uma
operação de e-commerce, com integração real via OAuth com a **TikTok Shop** (Shopee e Mercado Livre
continuam "Em breve" — sem integração real).

Este projeto passou por três fases:

- **Fase 1 (fundação):** monorepo, autenticação, RBAC, layout, navegação e telas principais com dados
  de seed.
- **Fase 2 (maturidade operacional):** estoque com saldo físico/reservado/disponível e ledger completo
  com escrita atômica (segura contra concorrência), rateio de custo na entrada, máquina de estados do
  pedido, snapshot de venda, cancelamento/devolução/reembolso completos, financeiro centralizado no
  backend com imposto estimado configurável e despesas recorrentes, upload real de XML fiscal com
  exportação em lote, e mais. Detalhes completos da revisão e do que ficou para uma próxima iteração
  em **`docs/phase2-review.md`**.
- **Fase 3 (integração TikTok Shop):** OAuth real (state de uso único protegido contra replay,
  credenciais criptografadas em repouso, refresh automático com lock distribuído), conector tipado
  (`packages/integrations/src/tiktok`) que nunca vaza payload bruto da TikTok para o domínio interno,
  importação incremental de pedidos/produtos com janela de sobreposição, webhook com verificação de
  assinatura + idempotência + reconciliação periódica como rede de segurança, comparação/envio manual
  de estoque (nunca automático por padrão), financeiro/settlement, devoluções sincronizadas, fila
  nomeada `integration` com retry classificado por categoria de erro e tela de falhas. Pesquisa oficial,
  decisões e o que ficou de fora em **`docs/integrations/tiktok.md`** e
  **`docs/integrations/tiktok-data-mapping.md`**.
- **Fase 4 (simplificação fiscal + maturidade gerencial e operacional):** `FiscalDocument` tratado
  como referência (XML sob demanda, `XML_STORAGE_MODE=REFERENCE_ONLY` por padrão), fechamento
  mensal com checklist ao vivo e snapshot de indicadores, dashboard gerencial (faturamento x
  resultado, canais, ranking de produtos, estoque parado/cobertura/reposição sugerida, seção
  "precisa da sua atenção"), busca global + Ctrl+K, notificações internas deduplicadas e
  autorresolvidas, painel de jobs (reaproveita `SyncJob` da Fase 3, sem mudança de schema), outbox
  de sincronização de estoque multicanal (via reconciliação periódica, nunca no caminho da venda;
  continua desligado por padrão), filtros persistentes na URL e onboarding não bloqueante. Revisão
  completa, decisões de design e o que ficou por fazer em **`docs/phase4-review.md`**.

## Stack

| Camada | Tecnologia |
| --- | --- |
| Frontend | Next.js 14 (App Router) · React 18 · TypeScript · Tailwind CSS · shadcn/ui (componentes próprios) · Recharts |
| Backend | Node.js · NestJS 10 · TypeScript · Prisma ORM |
| Banco | PostgreSQL (instalado **fora** do Docker, direto na VM) |
| Infra | Docker Compose · Traefik · Redis |
| Fila/Worker | BullMQ sobre Redis, worker compartilha a mesma base NestJS da API |

Arquitetura:

```text
Internet → Cloudflare → Traefik → ┬─ Next.js (ecommerce-web)
                                   └─ NestJS API (ecommerce-api) → Redis → Worker (ecommerce-worker) → PostgreSQL (na VM, fora do Docker)
```

Monólito modular — sem microserviços, sem Kubernetes, sem Python.

## Estrutura do monorepo

```text
ecommerce-manager/ (esta pasta)
├── apps/
│   ├── web/            Next.js (frontend)
│   └── api/             NestJS (API HTTP + worker + CLI)
├── packages/
│   ├── database/        Schema Prisma, client compartilhado, seed
│   ├── shared/           Constantes/tipos/utilitários seguros para o browser (permissões, dinheiro, etc.)
│   ├── shared-server/    Utilitários que dependem de Node nativo (hash de senha com argon2) — nunca importado pelo frontend
│   ├── integrations/     Contratos para futuros conectores de marketplace (ainda não implementados)
│   └── ui/               Mapas de apresentação de status (label + cor) compartilhados
├── infra/
│   ├── docker/           Dockerfiles da API/worker e do web
│   ├── traefik/          Configuração estática/dinâmica do Traefik
│   └── scripts/          Scripts auxiliares de operação
├── docs/
├── docker-compose.yml
├── .env.example
└── README.md
```

Workspaces npm (`npm install` na raiz instala tudo de uma vez).

## Pré-requisitos

- Node.js 20+
- npm 10+ (o repo usa **npm workspaces**, não pnpm/yarn)
- Docker + Docker Compose (na VM de destino)
- PostgreSQL 14+ **instalado diretamente na VM** (não roda em container) — crie um banco e um usuário
  dedicados antes de continuar
- Redis é provisionado pelo próprio `docker-compose.yml`, não precisa instalar nada à parte

## Primeiros passos (desenvolvimento local)

```bash
# 1. Instalar dependências de todo o monorepo
npm install

# 2. Configurar variáveis de ambiente
cp .env.example .env
# edite DATABASE_URL para apontar para o seu Postgres local, e gere segredos JWT novos:
#   openssl rand -base64 48

# 3. Build dos pacotes internos (obrigatório antes de rodar a API/worker/scripts,
#    já que @ecommerce-manager/shared, shared-server e database são consumidos como
#    pacotes compilados, não via source direto)
npm run build --workspace=@ecommerce-manager/shared
npm run build --workspace=@ecommerce-manager/shared-server
npm run build --workspace=@ecommerce-manager/database
npm run build --workspace=@ecommerce-manager/integrations
npm run build --workspace=@ecommerce-manager/ui

# 4. Gerar o Prisma Client e aplicar as migrations no seu Postgres
npx prisma generate --schema packages/database/prisma/schema.prisma
npm run prisma:migrate     # roda `prisma migrate dev` — cria as tabelas a partir do schema

# 5. Popular o banco com dados de desenvolvimento (empresa, usuários, produtos, pedidos, etc.)
npm run prisma:seed
# a saída mostra o e-mail do admin e a senha gerada (se SEED_ADMIN_PASSWORD não foi definida no .env)
# GUARDE essa senha — ela não é exibida novamente.

# 6. Rodar a API e o frontend em modo desenvolvimento (dois terminais)
npm run dev:api    # http://localhost:3001/api
npm run dev:web    # http://localhost:3000
```

> **Importante — este projeto foi montado em uma máquina de controle sem Docker e sem PostgreSQL
> instalados.** O schema Prisma foi validado (`prisma validate` e `prisma generate` — ambos passam
> limpos) e toda a API/worker foi compilada e testada com sucesso (build + lint + testes unitários e
> e2e), mas os passos 4 e 5 acima (`prisma migrate dev` e `prisma db seed`) **ainda não foram
> executados contra um banco real** e precisam ser rodados no primeiro ambiente com PostgreSQL
> disponível (seu ambiente local ou a própria VM). É o primeiro passo obrigatório antes de considerar
> esta etapa validada de ponta a ponta.

### Criando o primeiro usuário administrador

Duas formas, ambas sem senha padrão fixa no código:

1. **Via seed** (`npm run prisma:seed`) — cria uma empresa e usuários de demonstração (admin +
   manager + operator + viewer). Se `SEED_ADMIN_PASSWORD`/`SEED_DEMO_PASSWORD` não estiverem no
   `.env`, uma senha aleatória forte é gerada e impressa uma única vez no terminal.
2. **Via CLI dedicada** (produção, sem dados de demonstração):
   ```bash
   npm run build --workspace=@ecommerce-manager/api
   npm run create-admin --workspace=@ecommerce-manager/api -- --email admin@suaempresa.com --company "Sua Empresa"
   ```
   Se `--password` não for informado, uma senha forte é gerada e exibida uma única vez.

## Rodando com Docker Compose (produção / VM)

Pressupõe que o PostgreSQL já está instalado e configurado na VM (fora do Docker). Este roteiro
foi validado de ponta a ponta num deploy real (não só revisado manualmente) — os passos abaixo já
refletem os ajustes necessários encontrados nesse teste.

### 1. Preparar o PostgreSQL para aceitar conexão dos containers

Por padrão, uma instalação nova do PostgreSQL só escuta em `127.0.0.1` — nenhum container
consegue alcançar isso, independente de `host.docker.internal` estar mapeado corretamente ou não.

```bash
sudo -u postgres psql -c "SHOW config_file;"   # localiza postgresql.conf / pg_hba.conf
```

Em `postgresql.conf`, troque `listen_addresses = 'localhost'` por `listen_addresses = '*'`. Em
`pg_hba.conf`, adicione (**antes** de qualquer linha `reject`), usando o mesmo método de
autenticação já usado nas outras linhas do arquivo (`md5` ou `scram-sha-256` — confira com
`grep -vE "^#|^$" pg_hba.conf`; se a senha do usuário foi definida com `password_encryption=md5`
no servidor, a linha **precisa** ser `md5`, senão a autenticação falha mesmo com a senha certa):

```
host    all    ecommerce_manager    172.17.0.0/16    md5
host    all    ecommerce_manager    172.21.0.0/16    md5
```

(`172.17.0.0/16` cobre a bridge padrão do Docker; `172.21.0.0/16` é a sub-rede de
`ecommerce-network`, definida neste `docker-compose.yml` — confira a sua com
`docker network inspect ecommerce-network --format '{{json .IPAM.Config}}'` caso seja diferente.
O campo do banco é `all`, não `ecommerce_manager`: o Prisma cria um banco "sombra" com nome
gerado dinamicamente na primeira vez que gera uma migration, e ele também precisa de acesso.)

```bash
systemctl restart postgresql
```

### 2. Configurar `.env`

```bash
cp .env.example .env
```

Preencha pelo menos:
- `DATABASE_URL` — aponte para `host.docker.internal` (containers) com usuário/senha do passo 1.
  Evite caracteres especiais na senha, ou codifique-os em percent-encoding (`@`→`%40` etc.) —
  nunca coloque a senha entre aspas dentro da URL.
- `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` / `INTEGRATION_SECRETS_KEY` — `openssl rand -base64 48`
- `WEB_DOMAIN`, `API_DOMAIN`, `WEB_APP_URL`, `NEXT_PUBLIC_API_URL`, `COOKIE_DOMAIN` — domínios reais
  apontando para a VM. **Testando sem domínio real ainda (acesso direto por IP)?** Veja a seção
  "Testar sem domínio/TLS" mais abaixo — `WEB_DOMAIN`/`API_DOMAIN` como IP puro não funciona com
  Traefik + Let's Encrypt (Let's Encrypt não emite certificado para IP).

### 3. Build e primeiro banco

```bash
docker compose build
```

Na primeira vez (banco vazio), crie o histórico de migrations do Prisma junto com o schema —
monte a pasta como volume para os arquivos ficarem no disco da VM (sem isso, o container
descartável apaga a pasta ao sair):

```bash
docker compose run --rm -v "$(pwd)/packages/database/prisma:/app/packages/database/prisma" \
  ecommerce-api npx prisma migrate dev --schema packages/database/prisma/schema.prisma --name init
```

Isso exige temporariamente permissão `CREATEDB` no usuário do Postgres (para o banco "sombra" do
Prisma comparar o schema):
```bash
sudo -u postgres psql -c "ALTER USER ecommerce_manager WITH CREATEDB;"
# ... rode o comando de migration acima ...
sudo -u postgres psql -c "ALTER USER ecommerce_manager WITH NOCREATEDB;"   # revogue depois
```

Depois de gerado uma vez, **comite a pasta `packages/database/prisma/migrations/`** — deploys
seguintes usam só `prisma migrate deploy` (sem `CREATEDB`, sem banco sombra):
```bash
git add packages/database/prisma/migrations && git commit -m "chore: bootstrap prisma migration history" && git push
```

Em deploys seguintes (com migration history já commitada):
```bash
docker compose run --rm ecommerce-api npx prisma migrate deploy --schema packages/database/prisma/schema.prisma
```

Crie o usuário administrador:
```bash
docker compose run --rm ecommerce-api node apps/api/dist/cli/create-admin.js \
  --email admin@suaempresa.com --company "Sua Empresa"
```
(sem `--password`, uma senha forte é gerada e exibida uma única vez no terminal — guarde-a)

### 4. Subir tudo

```bash
docker compose up -d
docker compose ps      # todos devem ficar "healthy"/"running"
```

Serviços:

- `traefik` — proxy reverso/roteamento, TLS via Let's Encrypt (HTTP-01 por padrão; ajuste para
  DNS-01 se a Cloudflare estiver em modo "Proxied" — ver comentários em `infra/traefik/traefik.yml`)
- `ecommerce-web` — Next.js (porta interna 3000)
- `ecommerce-api` — NestJS (porta interna 3001), expõe `/api/**`
- `ecommerce-worker` — mesma imagem da API, executando `dist/worker.js` (processa filas do Redis)
- `redis` — fila/cache

O PostgreSQL **não** está no `docker-compose.yml` de propósito. Os containers `ecommerce-api` e
`ecommerce-worker` alcançam o Postgres da VM via `host.docker.internal` (mapeado com
`extra_hosts: host.docker.internal:host-gateway`, necessário no Linux com Docker ≥ 20.10).

### Testar sem domínio/TLS (acesso direto por IP)

Só para validar um deploy antes de ter domínio real apontado para a VM — **nunca para tráfego
real saindo para a internet** (sem TLS, sem os security headers que o Traefik aplica):

1. No `.env`: `NEXT_PUBLIC_API_URL=http://SEU_IP:3001/api`, `WEB_APP_URL=http://SEU_IP:3000`,
   `COOKIE_DOMAIN=` (vazio — o atributo `Domain` do cookie não é válido para hosts que são IP
   puro; o navegador rejeita o cookie inteiro se vier definido), `COOKIE_SECURE=false` (cookies
   `Secure` são recusados pelo navegador fora de HTTPS).
2. `ecommerce-api`/`ecommerce-web` já expõem as portas 3001/3000 diretamente no
   `docker-compose.yml` para esse cenário (comentado como temporário — remova quando configurar
   domínio real).
3. `docker compose build && docker compose up -d` (rebuild necessário: `NEXT_PUBLIC_API_URL` é
   embutido no bundle do navegador em tempo de build, não lido em tempo de execução).
4. Acesse `http://SEU_IP:3000`.

## Testes, lint e build

```bash
npm run lint    # eslint em todos os workspaces
npm run test    # testes unitários (api) — jest
npm run build   # build de todos os workspaces, na ordem correta de dependências

# Testes e2e da API (guards de autenticação/permissão/CSRF, sem depender de banco real)
npm run test:e2e --workspace=@ecommerce-manager/api
```

Estado atual verificado nesta etapa:

- ✅ `npm run build` de `database`, `shared`, `shared-server`, `integrations`, `ui`, `api` e `web` —
  zero erros de TypeScript.
- ✅ `npx eslint` em `apps/api/src/**` e `apps/web/**` — zero erros/avisos.
- ✅ Testes unitários da API — 52 testes (guards de permissão, sanitização de logs, rateio de custo,
  máquina de estados do pedido, ledger de estoque sob concorrência simulada, extração de XML fiscal,
  assinatura de API/webhook da TikTok Shop, mapper de status/financeiro, política de retry por
  categoria de erro, importação/reconciliação/reprocessamento de pedidos externos incl. SKU sem
  vínculo e atualização fora de ordem) — e 7 testes e2e da cadeia de guards (JWT + permissões + CSRF +
  rotas públicas) — todos passando.
- ✅ `prisma validate` / `prisma generate` — schema válido.
- ⏳ `prisma migrate dev` / `prisma db seed` contra um Postgres real — **pendente**, depende de um
  ambiente com PostgreSQL acessível (ver aviso na seção "Primeiros passos").
- ⏳ `docker compose up -d` de ponta a ponta — os arquivos foram revisados manualmente (sem erros de
  sintaxe/referência), mas não há Docker disponível na máquina onde este projeto foi montado para
  validar a execução real. Valide na VM de destino.

## Áreas da aplicação

```text
Dashboard     → cards com comparação de período · faturamento x resultado · canais · produtos ·
                "precisa da sua atenção" · onboarding (primeiros passos)
Vendas       → Pedidos · Nova venda · Devoluções · Canais
Produtos     → Produtos · Categorias · Estoque (+ estoque parado/reposição sugerida) · Entradas ·
               Movimentações
Financeiro   → Visão geral · Receitas · Despesas · Taxas · Fechamento mensal (checklist + snapshot)
Fiscal       → Documentos fiscais (upload manual, ação secundária) · Exportação de XML
               (preview por mês + ZIP sob demanda, ação principal)
Relatórios
Integrações  → TikTok Shop (OAuth real: produtos, pedidos, estoque + outbox de sincronização,
               financeiro, devoluções, falhas) · Shopee (Em breve) · Mercado Livre (Em breve)
Configurações → Empresa (inclui sincronização automática de estoque) · Usuários · Permissões ·
               Jobs · Auditoria

Busca global + Ctrl+K (header) · Notificações internas (sino, header)
```

## Autenticação e segurança

- Senhas com **Argon2id** (`packages/shared-server`), nunca em texto plano, nunca logadas.
- Sessão via **JWT de acesso de curta duração (15 min)** em cookie `HttpOnly`, `Secure` (em
  produção), `SameSite=Strict`, mais um **refresh token opaco** (hash SHA-256 armazenado no banco,
  rotacionado a cada refresh) em cookie próprio restrito a `/auth`.
- Proteção **CSRF** via padrão *double-submit cookie* (`ecm_csrf_token`, legível por JS, espelhado no
  header `x-csrf-token` pelo frontend em toda requisição que altera estado).
- **Rate limiting** global (`@nestjs/throttler`) e mais restritivo em `/auth/login`.
- **Proteção contra brute force**: bloqueio temporário de conta após 5 tentativas de login inválidas.
- **RBAC granular**: roles (`ADMIN`, `MANAGER`, `OPERATOR`, `VIEWER`) e permissões (`product.read`,
  `order.create`, `inventory.adjust`, etc.) em tabelas próprias (`roles`, `permissions`,
  `user_roles`, `role_permissions`). Toda rota protegida verifica **permissão**, nunca o nome da
  role diretamente.
- **Helmet**, CSP, CORS restritivo à origem do frontend, `ValidationPipe` global com
  `whitelist`/`forbidNonWhitelisted` (proteção contra mass assignment), sanitização de logs (senhas,
  tokens e segredos nunca aparecem em nenhum log).
- **Auditoria**: toda mutação relevante grava um registro em `audit_logs` (usuário, ação, entidade,
  valores antes/depois, IP, timestamp), consultável em Configurações → Auditoria.

## Observabilidade

- Logs estruturados em JSON (`timestamp`, `level`, `service`, `request_id`, `user_id`, `operation`,
  `message`), nunca contendo dados sensíveis.
- `request_id` gerado (ou propagado, se enviado pelo cliente) em toda requisição via middleware,
  devolvido no header `x-request-id`.
- Health checks: `GET /api/health` (agregado), `GET /api/health/live` (liveness, sem dependências
  externas), `GET /api/health/ready` (readiness — verifica PostgreSQL via Prisma e Redis via
  `PING`).

## Dados de seed

O `npm run prisma:seed` cria: 1 empresa, usuários (admin + demo por role), categorias e produtos
temáticos (toalhas, roupa de cama, mantas, tapetes), variações/SKUs com histórico de custos,
fornecedores e entradas de estoque, canais (TikTok Shop, Shopee, Mercado Livre + manuais), pedidos
variados (incluindo um com devolução), uma venda manual, despesas em todas as categorias
obrigatórias, documentos fiscais (incluindo pedidos propositalmente sem NF-e, para exercitar o
alerta do dashboard), fechamento mensal do mês anterior e auditoria de exemplo — o suficiente para
testar toda a interface sem qualquer integração real com marketplace.

## Limitações conhecidas desta etapa (por escopo, não por esquecimento)

- TikTok Shop tem integração real (OAuth, importação, webhooks, financeiro, devoluções, outbox de
  estoque). Shopee e Mercado Livre continuam só como telas "Em breve" — toda ação de
  conectar/sincronizar retorna explicitamente "não implementado nesta etapa" (HTTP 501).
- O sistema **nunca emite NF-e** (não é um ERP fiscal nem substitui um emissor/contador — ver
  `docs/phase4-review.md`, regra fundamental da Fase 4). `FiscalDocument` é só uma referência a um
  documento emitido em outro lugar; o XML pode ser importado manualmente (upload) ou baixado sob
  demanda via um `FiscalDocumentProvider` quando existir uma fonte oficial — hoje só o provider
  manual existe, nenhum XML é gerado artificialmente.
- `Company.allowNegativeStock` existe no schema e é aceito no cadastro, mas o
  `InventoryLedgerService` ainda não o lê (sempre rejeita saldo físico negativo, independente do
  valor da flag) — limitação consciente, documentada em `docs/phase4-review.md`.
- Sincronização automática de estoque (outbox multicanal) exige dois interruptores ligados ao
  mesmo tempo (`TIKTOK_INVENTORY_PUSH_ENABLED` no servidor **e** o toggle por empresa em
  Configurações → Empresa) e continua desligada por padrão — o outbox só detecta e acumula
  divergência até que um ADMIN ative os dois.
- Algumas dependências transitivas do NestJS 10/Next.js 14 têm avisos de segurança conhecidos
  (`npm audit`) cuja correção completa exigiria major upgrades (Nest 10→12, Next 14→16) fora do
  escopo desta fundação; a versão patch mais recente de cada major já está em uso.
