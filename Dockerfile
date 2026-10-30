# Huspee API (Phase 1). Build from the repository root: docker build -t huspee-api .
ARG NODE_IMAGE=node:22-bookworm-slim
FROM ${NODE_IMAGE} AS base
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@10.0.0 --activate
WORKDIR /app

FROM base AS build
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY packages/sdk/package.json packages/sdk/
COPY tests/package.json tests/
RUN pnpm install --frozen-lockfile --filter @huspee/api...
COPY apps/api apps/api
RUN pnpm --filter @huspee/api build

FROM base AS runtime
ENV NODE_ENV=production
# The voice assistant runs on the Codex CLI; its login is connected in Seller Centre (see docker-compose.yml).
RUN npm install -g @openai/codex@0.166.0 && codex --version
COPY --from=build /app /app
WORKDIR /app/apps/api
COPY docker/api-entrypoint.sh /usr/local/bin/api-entrypoint.sh
RUN chmod +x /usr/local/bin/api-entrypoint.sh
EXPOSE 3000
ENTRYPOINT ["api-entrypoint.sh"]
CMD ["node", "dist/main.js"]
