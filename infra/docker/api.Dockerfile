# syntax=docker/dockerfile:1
# Imagem única compartilhada por ecommerce-api e ecommerce-worker.
# O container decide o processo a executar via CMD (definido no docker-compose.yml).
FROM node:20-bookworm-slim AS base
WORKDIR /app
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*

FROM base AS deps
COPY package.json package-lock.json* ./
COPY apps/api/package.json apps/api/package.json
COPY packages/database/package.json packages/database/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/shared-server/package.json packages/shared-server/package.json
COPY packages/integrations/package.json packages/integrations/package.json
# Nunca copiar apps/web nem packages/ui aqui: esta imagem não usa nenhum dos dois, e
# `npm install --workspaces` instala TUDO que estiver presente na árvore — incluir o package.json
# do Web faria a imagem da API instalar Next.js/React/Recharts/Tailwind à toa (confirmado: ~280
# pacotes a mais, só peso e tempo de build, sem nenhum uso). Um "Cannot find module '@nestjs/config'"
# visto em produção uma vez pareceu vir daqui, mas era coincidência — a causa real era o
# package-lock.json sem entrada pra @nestjs/config/jwt/schedule (corrigido separadamente);
# confirmado depois que reinstalar só com este subconjunto de workspaces resolve certinho.
# `npm ci` em vez de `npm install`: instala exatamente o que o lockfile manda (sem gastar tempo
# re-resolvendo versões) e, principalmente, FALHA alto se package.json e package-lock.json algum
# dia saírem de sincronia de novo — em vez de instalar uma árvore incompleta em silêncio, como
# aconteceu com @nestjs/config/jwt/schedule.
# Cache persistente do BuildKit pro diretório de cache do npm (id compartilhado com web.Dockerfile
# de propósito): os pacotes baixados aqui ficam disponíveis pro build do Web também, e para
# builds futuros — mesmo quando o `npm ci` precisa rodar de novo por causa de mudança no
# lockfile, ele reaproveita os pacotes já baixados em vez de buscar tudo de novo na internet.
# Sem isso, cada mudança de dependência derruba o cache normal de camada do Docker (que é tudo-
# ou-nada) e força um download completo do zero — foi boa parte do motivo dos últimos builds
# terem ficado tão mais lentos.
RUN --mount=type=cache,target=/root/.npm,id=npm-cache \
    npm ci --workspaces --include-workspace-root

FROM deps AS build
COPY . .
# prisma generate PRECISA rodar antes do build de `database`: packages/database/src/index.ts
# importa o client gerado (../generated/client), então `tsc` falha se o client ainda não existir.
RUN npx prisma generate --schema packages/database/prisma/schema.prisma
RUN npm run build --workspace=@ecommerce-manager/shared
RUN npm run build --workspace=@ecommerce-manager/shared-server
RUN npm run build --workspace=@ecommerce-manager/database
RUN npm run build --workspace=@ecommerce-manager/integrations
RUN npm run build --workspace=@ecommerce-manager/api

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/packages ./packages
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/api/package.json ./apps/api/package.json
# Necessário só pro `npm run prisma:seed` (`ts-node`, roda direto do .ts em vez de compilado —
# todo o resto desta imagem já roda `node` sobre JS compilado). `packages/database/tsconfig.json`
# faz `"extends": "../../tsconfig.base.json"` (raiz do monorepo); sem este arquivo aqui, `ts-node`
# falha com "Cannot read file '/app/tsconfig.base.json'" (CONFIRMADO em produção) porque a imagem
# nunca copiava nada fora de `packages/`.
COPY --from=build /app/tsconfig.base.json ./tsconfig.base.json
EXPOSE 3001
CMD ["node", "apps/api/dist/main.js"]
