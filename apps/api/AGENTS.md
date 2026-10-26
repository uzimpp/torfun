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

Three behaviours of a Run (`pipeline.ts` and the modules it wires, listed in its
header) are load-bearing:

- **A rate-limit response aborts the run.** The right answer to a site saying stop
  is to stop, leaving the rest Queued. Archives already downloaded are still
  analysed and stored; nothing further is asked of the site.
- **Every other failure is recorded and the pass continues**, into the
  admin-visible log. The one other stop is a site that no longer answers (below).
- **Path-traversal members in an archive are surfaced, never dropped.**

Discovery (`services/egp/discovery.ts`) reads the announcement feed
(`announcement-feed.ts`, the RSS on `https://process.gprocurement.go.th`) for
each `FEED_REGISTRY` agency × {B0, D0}, one day per request. The Feed Cursor (a
contiguous range of fully-read days per agency and type, in the ingestion meta
collection) decides what to ask: first
the days after each range up to today (today is re-read and never recorded), then
history newest-first, at most `FEED_BACKFILL_REQUESTS_PER_RUN` requests, back
`FEED_HISTORY_DAYS`; only feed requests count toward that share. A project is
stored from the feed alone, with `budgetYear`, `typeId`, `goodsId` and
`deptSubName` null: they come from its project detail
(`AnnouncementClient.projectDetail`, the getProjectDetail endpoint), which
Retrieval reads in the record's own gate turn (ADR-0020). Until then the year is
null, never guessed. Each agency-day is saved as soon as it is read, and its new
projects join Retrieval's queue at once. Every Run reads the new days; the cursor
covers exactly the days read in full, even when the sweep is cut short. The open-data
client is kept for a future winner lookup and is not used for discovery. Never
call the process5 search endpoints: they sit behind Cloudflare Turnstile
(ADR-0018).

A Run has three stages side by side (ADR-0020): Discovery, one Retrieval worker
taking one project at a time, and Analysis, one task per downloaded Archive. The
upstream site is reached through one gate (`services/egp/site-gate.ts`), shared
by Discovery and Retrieval: one request in flight, a pause after each, and when
it frees the next turn goes to the best tier waiting: new days, then fresh
(never read), then refresh, then history. Do not call the site from anywhere
that bypasses the gate.

Analysis never touches the site, so it is the only work that overlaps the gate.
`ANALYSIS_CONCURRENCY` (default 8) bounds model calls in flight across the whole
Run, and the waiting room, the Archives held in memory waiting for or under
Analysis, has as many places. A fresh project takes a place before its turn; a
refresh whose invitation moved takes one only if one is free, else it goes to
the back of the queue. While the room is full the gate keeps serving Discovery
and refreshes.

How a Run stops: a refusal (429/403) latches the gate; `SITE_UNREACHABLE_AFTER`
requests in a row with no answer, Discovery's and Retrieval's counted together,
close it; so does an administrator's stop or a lost lease. Either way no further
request is made and nothing new is taken from the queue; projects not taken
are left as they were, with no attempt spent. Analysis finishes the Archives it holds and stores
them. Otherwise the Run ends once Discovery is done, the queue is empty and every
Analysis has settled. A record's deadline (`recordDeadlineMs`) covers its gate
turn; its Analysis has a deadline of the same length.

Per candidate the turn is one gate hold: the project detail first while
`detailCheckedAt` is null (every new record), then the announcement timeline
(`AnnouncementClient`, the greenBook endpoint), the archive lookup and the
download. A failed detail is logged and the record carries on with the year it
has, null for a new one; the next Run asks again. A refusal on it stops the Run
like any other. The pipeline works the never-read projects first, then the already-read
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
rebuilt from the feed snapshot the tombstone keeps (`feed-record.ts`). A one-project
Run skips Discovery, so a tombstone written before snapshots has nothing to
rebuild from: the project comes back only if a later Run's days include it, and
the restore says so in the failure log.

All `/api/ingestion/*` routes are admin-only, enforced once for the plugin scope.

## Conventions

- Files kebab-case, suffixed by layer: `auth.service.ts`, `user.repository.ts`.
- Identifiers camelCase. Convert older snake_case code when you touch it.
- **snake_case is a wire format, not a style** — JSON bodies, JWT claims, Mongo
  documents. It stops at the layer boundary: `company_name` in a response,
  `companyName` in a domain object. Changing a wire field breaks `apps/web`.
- Shared domain types live in `packages/types`. Persistence shapes (`_id`,
  `password_hash`) never leave their repository.
