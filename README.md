# torfun — TOR Finder

Automates discovery of software-related government procurement TORs (Terms
of Reference) published in Bangkok, Thailand — replacing manual visits to
dozens of procurement sites with a crawled, filtered, and scored feed.

## Stack

| Layer      | Choice                                                  |
| ---------- | -------------------------------------------------------- |
| Monorepo   | Turborepo + Bun workspaces                                |
| Frontend   | Next.js (App Router) + Tailwind CSS + shadcn/ui, Thai UI  |
| Backend    | Fastify (TypeScript) on Bun                               |
| Database   | MongoDB Atlas (local dev via `mongodb-atlas-local`)        |
| AI         | Vertex AI (Gemini) on Google Cloud                         |
| Testing    | Vitest + Testing Library (web), `bun:test` (api/packages), Playwright (e2e) |
| CI/CD      | GitHub Actions: lint/typecheck/test/build, security scans, Docker build & push |
| Security   | Helmet + CORS allowlist + rate limiting, CSP/HSTS headers, `bun audit`, gitleaks, CodeQL, Trivy, OWASP ZAP baseline |

## Repo layout

```
apps/
  web/            Next.js frontend (Thai UI)
  api/            Fastify backend
packages/
  types/          Shared Zod schemas / TS types (User, Tor, MatchResult)
  config/         Shared tsconfig + eslint base config
.github/workflows/
  ci.yml          lint, typecheck, unit tests, build, Playwright e2e
  security.yml    bun audit, gitleaks, CodeQL, Trivy, OWASP ZAP baseline
  docker.yml      build & push images to GHCR on main/tags
```

## Getting started

Requires [Bun](https://bun.sh) ≥ 1.3 and Docker.

```bash
bun install
cp .env.example .env   # fill in MONGODB_URI, JWT_SECRET, GOOGLE_CLOUD_PROJECT, ...

# local Mongo (mirrors Atlas, including Atlas Search)
docker compose up -d mongodb

bun run dev             # runs apps/web and apps/api in parallel via turbo
```

- Web: http://localhost:3000
- API: http://localhost:8080/api/health

### Common commands

```bash
bun run lint            # eslint across all workspaces
bun run typecheck       # tsc --noEmit across all workspaces
bun run test            # vitest (web) + bun:test (api, packages)
bun run test:e2e        # Playwright, against a production build
bun run build           # turbo build
```

### Full stack via Docker

```bash
docker compose up --build
```

## Security

- `apps/api` ships with Helmet security headers, an explicit CORS allowlist,
  and per-IP rate limiting out of the box.
- `apps/web`'s `next.config.ts` sets CSP, HSTS, X-Frame-Options, and related
  headers.
- `bun audit` runs in CI on every push/PR and weekly on a schedule, alongside
  gitleaks (secrets), CodeQL (SAST), Trivy (container images), and an OWASP
  ZAP baseline scan (DAST) against the docker-compose stack. See
  `.github/workflows/security.yml`.
- Never commit `.env`; `GOOGLE_APPLICATION_CREDENTIALS` service-account keys
  are for local dev only — deployed environments should use Workload
  Identity Federation.

## Domain model

`packages/types` is the single source of truth for shared shapes:

- `User` — RBAC roles: `admin`, `business_development_officer` (USR-10).
- `Tor` — a procurement announcement; scoped to `province: 'bangkok'`,
  de-duplicated via `contentHash` (functional requirement).
- `MatchResult` — matching score breakdown (tech stack, deadline, industry,
  target platform, decision rules) computed against a `CompanyProfile`.

The matching weights and decision-rules logic are still TBD.
