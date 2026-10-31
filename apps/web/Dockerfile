# Huspee Web (Phase 1). Build from the repository root: docker build -f apps/web/Dockerfile .
ARG NODE_IMAGE=node:22-bookworm-slim
FROM ${NODE_IMAGE} AS base
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@10.0.0 --activate
WORKDIR /app

FROM base AS build
ENV NODE_ENV=production

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/sdk/package.json packages/sdk/
COPY packages/web-ui/package.json packages/web-ui/
COPY tests/package.json tests/

RUN pnpm install --frozen-lockfile --filter @huspee/web...

COPY packages/sdk packages/sdk
RUN pnpm --filter @huspee/sdk build

COPY packages/web-ui packages/web-ui
COPY apps/web apps/web
RUN pnpm --filter @huspee/web build

FROM base AS runtime
ENV NODE_ENV=production
ENV PORT=3001
ENV HOSTNAME="0.0.0.0"

WORKDIR /app

COPY --from=build /app/apps/web/.next/standalone ./
COPY --from=build /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build /app/apps/web/public ./apps/web/public

EXPOSE 3001
CMD ["node", "apps/web/server.js"]
