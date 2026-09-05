# syntax=docker/dockerfile:1
FROM node:20-bookworm-slim AS base
WORKDIR /app
# Mesmo ajuste do api.Dockerfile: silencia o aviso de versão major do npm embutido na imagem base
# (npm@12 exige Node 22+, incompatível com esta imagem Node 20 — ver comentário lá).
RUN npm install -g npm@11.19.1

FROM base AS deps
COPY package.json package-lock.json* ./
COPY apps/web/package.json apps/web/package.json
COPY packages/database/package.json packages/database/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/ui/package.json packages/ui/package.json
# Nunca copiar apps/api nem packages/shared-server/integrations aqui, pelo mesmo motivo do
# comentário equivalente em api.Dockerfile: instalaria NestJS e companhia à toa nesta imagem, que
# nunca usa nenhum dos dois.
# `npm ci`: ver comentário equivalente em api.Dockerfile — mais rápido e falha alto se
# package.json/package-lock.json saírem de sincronia, em vez de instalar algo incompleto calado.
# Mesmo cache persistente do BuildKit usado no api.Dockerfile (mesmo id de propósito — os dois
# builds reaproveitam os mesmos pacotes já baixados, nunca buscam da internet duas vezes).
RUN --mount=type=cache,target=/root/.npm,id=npm-cache \
    npm ci --workspaces --include-workspace-root

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
