# syntax=docker/dockerfile:1
# Build context is the repo root (see docker-compose.yml), because Turborepo
# needs the full workspace to prune correctly.

FROM oven/bun:1.3.11 AS pruner
WORKDIR /app
COPY . .
RUN bunx turbo prune @torfun/web --docker

FROM oven/bun:1.3.11 AS installer
WORKDIR /app
COPY --from=pruner /app/out/json/ .
RUN bun install --frozen-lockfile
COPY --from=pruner /app/out/full/ .
ENV NEXT_TELEMETRY_DISABLED=1
# `next build` (Turbopack) crashes/misbehaves running under Bun-as-runtime on
# Linux (segfault, and separately a CommonJS-interop error loading Next's
# compiled SSR chunks). `bun run`/`turbo` would still route through Bun here
# even with real Node on PATH, since Bun intercepts node-shebang scripts —
# so invoke Next's CLI with `node` directly, bypassing that.
COPY --from=node:22-slim /usr/local/bin/node /usr/local/bin/node
# next lives in the hoisted root node_modules, not apps/web/node_modules
# (see bunfig.toml — hoisted linker, for standalone-output tracing to work).
RUN cd apps/web && node /app/node_modules/next/dist/bin/next build

# Bun runs the build for speed; Next.js standalone output is served on
# Node.js in production, its officially supported server runtime.
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# The base image ships whatever OpenSSL was current when it was published, so
# pick up distro fixes released since (mirrors `apt-get upgrade` in the API
# image). Without this, Trivy's HIGH/CRITICAL gate fails on libssl/libcrypto.
RUN apk upgrade --no-cache

RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack

COPY --from=installer --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
COPY --from=installer --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=installer --chown=nextjs:nodejs /app/apps/web/public ./apps/web/public

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

CMD ["node", "apps/web/server.js"]
