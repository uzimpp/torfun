# syntax=docker/dockerfile:1
# Build context is the repo root (see docker-compose.yml).

FROM oven/bun:1.3.11 AS pruner
WORKDIR /app
COPY . .
RUN bunx turbo prune @torfun/api --docker

FROM oven/bun:1.3.11 AS installer
WORKDIR /app
COPY --from=pruner /app/out/json/ .
RUN bun install --frozen-lockfile
COPY --from=pruner /app/out/full/ .
RUN bunx turbo build --filter=@torfun/api

FROM oven/bun:1.3.11-slim AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN apt-get update && apt-get upgrade -y && rm -rf /var/lib/apt/lists/*

# oven/bun:1-slim is Debian-based (no addgroup/adduser from BusyBox).
# --create-home: `bun run` needs a writable $HOME for its cache/transpiler
# files, which a homeless --system user doesn't get.
RUN groupadd --system --gid 1001 bunjs \
  && useradd --system --create-home --uid 1001 --gid bunjs fastify
ENV HOME=/home/fastify

COPY --from=installer --chown=fastify:bunjs /app/apps/api/dist ./dist

USER fastify
EXPOSE 8080

CMD ["bun", "run", "dist/server.js"]
