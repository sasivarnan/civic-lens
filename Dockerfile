FROM node:22-bookworm-slim AS build
RUN corepack enable && corepack prepare pnpm@12.4.1 --activate
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile
RUN node scripts/setup-local.mjs --assets-only && pnpm build

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/packages ./packages
COPY --from=build --chown=node:node /app/apps/backend ./apps/backend
COPY --from=build --chown=node:node /app/apps/frontend/dist ./apps/frontend/dist
USER node
WORKDIR /app/apps/backend
EXPOSE 3000
CMD ["node", "dist/index.js"]
