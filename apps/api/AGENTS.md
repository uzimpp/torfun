# apps/api — agent guide

Fastify 5 on Bun, MongoDB Atlas, Vertex AI. Read the root `AGENTS.md` first — the
upstream-access guardrails there are why several rules below exist.

Commands and configuration are in `README.md` beside this file. `bun run lint`
enforces the layer boundaries below; a violation fails the build.

## Layers

Dependencies point one way, and **ESLint enforces it** — fix the design, not the rule.

```
routes/  →  services/  →  repositories/  →  core/
```

| Layer           | Owns                                                       | Must not                                                            |
| --------------- | ---------------------------------------------------------- | ------------------------------------------------------------------- |
| `routes/`       | HTTP: validate input, call one service, shape the response | import `repositories/` or `core/mongo` (type-only imports are fine) |
| `services/`     | Business rules, orchestration, run state                   | import `FastifyRequest`/`Reply`/`Instance`                          |
| `repositories/` | Data access and the **only** document↔domain mapping       | contain business rules                                              |
| `core/`         | Connection lifecycle, error taxonomy                       | know about any feature                                              |

Also: `plugins/` (Fastify registrations, order-sensitive), `hooks/` (`requireAuth`,
`requireAdmin`, credential throttle), `config/env.ts` (zod), `types/` (module
augmentation).

The "no Fastify types in services" rule is what makes services testable without a
server. When a service needs something framework-shaped, take it as a plain
function — `AuthService` receives a `signToken` callback, not `app.jwt`.

## Composition root

`app.ts` is the only file that constructs anything: plugins in order (cookies
before JWT, JWT before anything that signs), then repositories, then services,
decorated onto the instance. Routes reach them as `app.authService` and never call
a constructor.

Adding a service: build it in `app.ts`, decorate it, declare it in
`src/types/fastify.d.ts`.

**Configuration is a parameter, not a global.** `buildApp(env)` accepts an `Env`;
only `server.ts` passes the real one, via the default. Nothing below `app.ts` may
import `loadEnv` — routes read `app.env`, plugins and services take `env` as an
argument. That is what lets a test build an instance with configuration of its
own (`buildApp(testEnv({ CORS_ORIGINS: '...' }))`), which the module-level cache
in `config/env.ts` would otherwise prevent. Tests never touch `process.env`, so
the suite does not depend on the shell, CI, or a developer's `.env`.

## Errors

Services throw from `core/errors.ts` (`NotFoundError`, `ConflictError`,
`TooManyRequestsError`, …). One `setErrorHandler` maps them to HTTP. Responses are
`{ message }`, plus `errors` for validation detail.

Never build a status code in a service, and don't `try`/`catch` in a route just to
produce an error response. Expected rejections log at debug so a scripted login
attempt can't flood the logs.

## Persistence

Mongo connects **lazily** by design: `buildApp()` must work with no database
reachable, or every test that injects a request needs one. Never connect at import
time or move a client into module scope.

`repositories/` owns the only document↔domain mapping. Documents are snake_case
because that's what's in Atlas; nothing above sees an `ObjectId`, and
`password_hash` leaves through one method (`findCredentials`) so no route can
serialise it by accident.

Schema changes to stored data need an idempotent script in `docs/migrations/` with
the `mongosh` invocation in a header comment.

## Ingestion

`services/ingestion.service.ts` owns policy (one run at a time, run lifecycle);
`services/egp/` is the upstream adapter. A run is started, not awaited — a pass
takes minutes, and progress is observed through the state the admin UI polls.

Three behaviours in `pipeline.ts` are load-bearing:

- **A rate-limit response aborts the run.** The right answer to a site saying stop
  is to stop, leaving the rest Queued.
- **Every other failure is recorded and the pass continues**, into the
  admin-visible log.
- **Path-traversal members in an archive are surfaced, never dropped.**

Several records can be worked on at once (`EGP_RUNNERS`, default 2), but the
upstream site is reached through one gate (`services/egp/site-gate.ts`): one
request in flight across all runners, a pause after each, and a refusal latches it
so every runner stops. Only the model's reading of a TOR overlaps. Do not call the
site from anywhere that bypasses the gate.

What the model's verdict may do is decided in `services/egp/decision.ts`: only a
confident, whole-document answer shows a record to officers or drops it (leaving a
tombstone); everything else is held (`needs_review`) for an administrator.

An administrator's overrides (approve a held record, mark non-software, delete with
or without a tombstone, remove or restore a tombstone) live in
`services/procurement-admin.service.ts`, not in `IngestionService`, and sit outside
the audience rule. Restoring is a Run like any other, asked for through
`startRun({ onlyProject, forceDiscovery, beforeRun })`: it sweeps (the record and
its feed fields are gone) but retrieves that one project, and the tombstone is
lifted in `beforeRun`, once the lease is held.

All `/api/ingestion/*` routes are admin-only, enforced once for the plugin scope.

## Conventions

- Files kebab-case, suffixed by layer: `auth.service.ts`, `user.repository.ts`.
- Identifiers camelCase. Convert older snake_case code when you touch it.
- **snake_case is a wire format, not a style** — JSON bodies, JWT claims, Mongo
  documents. It stops at the layer boundary: `company_name` in a response,
  `companyName` in a domain object. Changing a wire field breaks `apps/web`.
- Shared domain types live in `packages/types`. Persistence shapes (`_id`,
  `password_hash`) never leave their repository.
