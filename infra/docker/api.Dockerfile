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
# TODOS os workspaces do monorepo precisam estar presentes aqui, mesmo os que esta imagem não usa
# em tempo de execução (apps/web, packages/ui) — o `package-lock.json` da raiz foi gerado contra
# os 7 workspaces juntos, e `npm install --workspaces` com só um SUBCONJUNTO deles presente
# resolve/hoisteia a árvore de um jeito DIFERENTE do install local completo (confirmado em
# produção: sem `apps/web` e `packages/ui` aqui, `@nestjs/config` saía de `node_modules` na raiz,
# quebrando a imagem em runtime com `Cannot find module '@nestjs/config'` mesmo com o `npm
# install` do passo anterior tendo "funcionado" sem erro).
COPY apps/web/package.json apps/web/package.json
COPY packages/ui/package.json packages/ui/package.json
RUN npm install --workspaces --include-workspace-root

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
EXPOSE 3001
CMD ["node", "apps/api/dist/main.js"]
