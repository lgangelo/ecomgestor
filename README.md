# E-commerce Manager

Centro de controle de vendas, produtos, estoque, custos, lucratividade e documentos fiscais para uma
operação de e-commerce. Esta é a **primeira etapa** do produto: fundação técnica, autenticação, RBAC,
layout, navegação e todas as telas principais funcionando com dados de seed — **sem** integração real
com TikTok Shop, Shopee ou Mercado Livre (isso fica para uma etapa futura).

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

Pressupõe que o PostgreSQL já está instalado e configurado na VM (fora do Docker).

```bash
cp .env.example .env
# edite .env: DATABASE_URL (apontando para host.docker.internal, ver comentário no arquivo),
# WEB_DOMAIN, API_DOMAIN, JWT_ACCESS_SECRET, JWT_REFRESH_SECRET, COOKIE_DOMAIN, etc.

docker compose build
docker compose up -d
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

Depois do primeiro `docker compose up -d`, rode as migrations e o seed/CLI de admin dentro do
container da API (ou de uma máquina com acesso à mesma `DATABASE_URL`):

```bash
docker compose exec ecommerce-api npx prisma migrate deploy --schema packages/database/prisma/schema.prisma
docker compose exec ecommerce-api node apps/api/dist/... # ou rode create-admin via ts-node localmente apontando para o Postgres da VM
```

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
- ✅ Testes unitários da API (`sanitizeForLog`, `PermissionsGuard`) e testes e2e da cadeia de guards
  (JWT + permissões + CSRF + rotas públicas) — todos passando.
- ✅ `prisma validate` / `prisma generate` — schema válido.
- ⏳ `prisma migrate dev` / `prisma db seed` contra um Postgres real — **pendente**, depende de um
  ambiente com PostgreSQL acessível (ver aviso na seção "Primeiros passos").
- ⏳ `docker compose up -d` de ponta a ponta — os arquivos foram revisados manualmente (sem erros de
  sintaxe/referência), mas não há Docker disponível na máquina onde este projeto foi montado para
  validar a execução real. Valide na VM de destino.

## Áreas da aplicação

```text
Dashboard
Vendas       → Pedidos · Nova venda · Devoluções · Canais
Produtos     → Produtos · Categorias · Estoque · Entradas · Movimentações
Financeiro   → Visão geral · Receitas · Despesas · Taxas · Fechamento mensal
Fiscal       → Documentos fiscais · Exportação de XML
Relatórios
Integrações  → TikTok Shop (estrutura visual, sem chamadas reais) · Shopee (Em breve) · Mercado Livre (Em breve)
Configurações → Empresa · Usuários · Permissões · Auditoria
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

- Sem chamadas reais a TikTok Shop, Shopee ou Mercado Livre — as telas de integração existem, mas
  toda ação de conectar/sincronizar retorna explicitamente "não implementado nesta etapa" (HTTP 501).
- Exportação de XML fiscal gera documentos **mock** (fixture de teste) a partir dos dados já
  armazenados — não há integração real com SEFAZ.
- Algumas dependências transitivas do NestJS 10/Next.js 14 têm avisos de segurança conhecidos
  (`npm audit`) cuja correção completa exigiria major upgrades (Nest 10→12, Next 14→16) fora do
  escopo desta fundação; a versão patch mais recente de cada major já está em uso.
