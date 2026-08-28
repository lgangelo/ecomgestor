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
COPY packages/integrations/package.json packages/integrations/package.json
COPY packages/ui/package.json packages/ui/package.json
RUN npm install --workspaces --include-workspace-root

FROM deps AS build
COPY . .
RUN npm run build --workspace=@ecommerce-manager/database
RUN npm run build --workspace=@ecommerce-manager/shared
RUN npm run build --workspace=@ecommerce-manager/integrations
RUN npx prisma generate --schema packages/database/prisma/schema.prisma
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
