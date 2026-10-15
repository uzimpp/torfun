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

Discovery (`services/egp/discovery.ts`) reads the announcement feed
(`announcement-feed.ts`, process3 RSS) for each `FEED_REGISTRY` agency × {B0, D0},
one day per request. The Feed Cursor (a contiguous range of fully-read days per
agency and type, in the ingestion meta collection) decides what to ask: first
the days after each range up to today (today is re-read and never recorded), then
history newest-first, at most `FEED_BACKFILL_REQUESTS_PER_RUN` requests, back
`FEED_HISTORY_DAYS`. A project not stored yet has its project detail
(`AnnouncementClient.projectDetail`, the getProjectDetail endpoint) read before
it is kept: that is where `budgetYear`, `typeId`, `goodsId` and `deptSubName`
come from, and a project whose detail fails is not stored and its day is read
again (ADR-0019). Detail requests in the history pass count toward its share.
Its requests go through the same gate as retrieval's, and a
refusal there ends the Run with nothing retrieved; the cursor is stored either
way, and only a finished sweep counts for `DISCOVERY_MAX_AGE_MS`. The open-data
client is kept for a future winner lookup and is not used for discovery. Never
call the process5 search endpoints: they sit behind Cloudflare Turnstile
(ADR-0018).

Several records can be worked on at once (`EGP_RUNNERS`, default 2), but the
upstream site is reached through one gate (`services/egp/site-gate.ts`): one
request in flight across all runners, a pause after each, and a refusal latches it
so every runner stops. Only the model's reading of a TOR overlaps. Do not call the
site from anywhere that bypasses the gate.

Per candidate the first call is the announcement timeline (`AnnouncementClient`,
the greenBook endpoint), made inside the same gate hold as the archive lookup and
download. The one exception is a record stored before the detail was read
(`detailCheckedAt` null): its project detail comes first, in the same hold, and a
failure is logged and the old year kept. The pipeline works the never-read projects first, then the already-read
ones that are not `contracted`, oldest `timelineCheckedAt` first. A timeline that
changed nothing costs no archive or model call; one whose invitation date moved
re-reads the invitation alone. `data: null` means the site had none to give, never
"no announcements", and leaves the project as it was. Status comes only from
`milestones` through `statusFromMilestones`; nothing a model says sets it.

What the model's verdict may do is decided in `services/egp/decision.ts`: only a
confident, whole-document answer shows a record to officers or drops it (leaving a
tombstone); everything else is held (`needs_review`) for an administrator.

An administrator's overrides (approve a held record, mark non-software, delete with
or without a tombstone, remove or restore a tombstone) live in
`services/procurement-admin.service.ts`, not in `IngestionService`, and sit outside
the audience rule. Restoring is a Run like any other, asked for through
`startRun({ onlyProject, beforeRun })`, which retrieves that one project. In
`beforeRun`, once the lease is held, the tombstone is lifted and the record
rebuilt from the feed snapshot the tombstone keeps (`feed-record.ts`). A
tombstone written before snapshots has nothing to rebuild from, so its restore
also passes `forceDiscovery` and finds the project only if the sweep's days
include it.

All `/api/ingestion/*` routes are admin-only, enforced once for the plugin scope.

## Conventions

- Files kebab-case, suffixed by layer: `auth.service.ts`, `user.repository.ts`.
- Identifiers camelCase. Convert older snake_case code when you touch it.
- **snake_case is a wire format, not a style** — JSON bodies, JWT claims, Mongo
  documents. It stops at the layer boundary: `company_name` in a response,
  `companyName` in a domain object. Changing a wire field breaks `apps/web`.
- Shared domain types live in `packages/types`. Persistence shapes (`_id`,
  `password_hash`) never leave their repository.
