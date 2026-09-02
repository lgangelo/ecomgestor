FROM node:20-bookworm-slim AS base
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json* ./
COPY apps/web/package.json apps/web/package.json
COPY packages/database/package.json packages/database/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/ui/package.json packages/ui/package.json
# TODOS os workspaces do monorepo precisam estar presentes aqui, mesmo os que esta imagem não usa
# (apps/api, packages/shared-server, packages/integrations) — ver comentário equivalente em
# api.Dockerfile: `npm install --workspaces` com só um subconjunto dos workspaces presente pode
# resolver/hoistear a árvore de um jeito diferente do install local completo (o `package-lock.json`
# da raiz foi gerado contra os 7 workspaces juntos).
COPY apps/api/package.json apps/api/package.json
COPY packages/shared-server/package.json packages/shared-server/package.json
COPY packages/integrations/package.json packages/integrations/package.json
RUN npm install --workspaces --include-workspace-root

FROM deps AS build
COPY . .
# ARG por si só não fica visível para o processo do `RUN npm run build` (o Next.js lê
# process.env.NEXT_PUBLIC_API_URL) — precisa virar ENV explicitamente antes do build do web.
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
RUN npm run build --workspace=@ecommerce-manager/shared
RUN npm run build --workspace=@ecommerce-manager/ui
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build --workspace=@ecommerce-manager/web

FROM base AS runtime
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=build /app/apps/web/public ./apps/web/public
COPY --from=build /app/apps/web/.next/standalone ./
COPY --from=build /app/apps/web/.next/static ./apps/web/.next/static
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
