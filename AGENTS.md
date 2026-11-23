# AGENTS.md

Guidance for AI coding agents working in this repository. Claude Code reads it through the one-line `CLAUDE.md` import beside it. [`GLOSSARY.md`](GLOSSARY.md) defines the domain terms used below.

## What torfun is for

A software house wins work by finding government procurement announcements it can credibly bid on. Doing that by hand means visiting dozens of agency sites, opening Thai-language PDFs, and judging one project at a time whether it is software at all, whether it matches what the company has built before, and whether the deadline is reachable. Most of that effort goes into discarding projects.

torfun automates the discarding. It pulls procurement announcements, keeps the software-related ones, extracts what each Terms of Reference (TOR) document asks for, and scores each against the company's past experience. A person reads the ten that matter instead of the four hundred that don't.

Scope is narrow on purpose: software procurement, e-bidding tenders. Widening either is a product decision, not a refactor.

## Who uses it

| Role                         | Value in code                  | Does                                                                                                                                         |
| ---------------------------- | ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Business Development Officer | `business_development_officer` | Searches and filters TORs, reads AI summaries, checks match scores, and follows a TOR back to its source document before committing to a bid |
| Site Administrator           | `admin`                        | Runs and monitors ingestion, reviews the failure log, and manages accounts                                                                   |

Self-registration always creates a Business Development Officer. The admin role is granted, never claimed.

## How the pieces fit

```
   e-GP announcement feed       e-GP project pages
   (process RSS, by day)        (timeline, TOR archives)
             │                            │
             └──────────┬─────────────────┘
                        ▼
        apps/api  ── ingestion ──▶  MongoDB Atlas
        (Fastify)  ── analysis ──▶  Vertex AI (Gemini, native PDF reading)
                        ▲
                        │  JSON over HTTP, JWT in an httpOnly cookie
                        │
                   apps/web (Next.js)
```

Each Run has three stages working side by side. [`docs/ingestion-flow.md`](docs/ingestion-flow.md) has the full detail.

- Discovery reads e-GP's announcement feed, one agency and one day at a time, and admits the e-bidding draft TORs and invitations that have no tombstone. It never looks at the title. It asks about the days since the last Run first, then about a share of the past year. A new project is stored as Queued from the feed alone and handed to Retrieval at once.
- Retrieval makes one turn at the site per project. It reads the project detail until it has been read once, which gives the real budget year (empty until then, never guessed). It reads the announcement timeline (greenBook) for status and bid deadline. Then it fetches the announcement archive and extracts the TOR PDFs. Never-read projects go first, newest announcement first. Projects already read get their timeline read again, oldest check first, and are retrieved again only if the invitation moved. The open-data API is not read, because it holds only signed contracts.
- Analysis is Gemini reading the archive's TOR PDFs. It never touches e-GP, so it is the only stage that overlaps another stage's requests.

Discovery and Retrieval reach `gprocurement.go.th` through one gate, one request at a time. The open-data API (GovSpending) is not read for discovery or the queue; it is read separately, for past awards, bidders and prices, never through that gate.

A record carries a coarse `state` (Queued, Processing, then Completed or Failed) and a finer `outcome`. "No TOR was ever published" is a legitimate upstream answer, not a failure, and an admin needs to tell the two apart.

`packages/types` holds the domain vocabulary (`Procurement`, `User`, `MatchResult`, the ingestion records) as zod schemas, and both apps import it. It is the contract between them. When you change a schema, both sides fail to compile until they handle it.

## Guardrails

### Upstream access is conditional

`gprocurement.go.th` publishes `robots.txt: Disallow: /`. This project operates under a research authorisation whose limits are not recorded in this repository. To stay within the spirit of it, the code does the following:

- Requests go one at a time through one gate, with a politeness delay after each.
- A rate-limit or forbidden response closes the gate for the rest of the Run.
- Only one Run goes at a time.

Every request to the site is one of these, and all happen inside one gate hold: the announcement feed that Discovery reads (one agency, one type, one day), and, for each project, its project detail (until read once), its announcement timeline (greenBook), the archive lookup, and the download.

The process5 project search sits behind Cloudflare Turnstile and is never called. Do not add a captcha solver, a copied browser token, or a headless browser to reach it. The delays and the gate are not performance tuning. Do not parallelise around them, and do not retry past a refusal.

No volume cap applies, so a Run works through the whole queue. That is the owner's decision. If the site's owner ever states a limit, put it in code, not in this file. The one exception is Discovery's history: reading the past year takes a fixed share of each Run (`FEED_BACKFILL_REQUESTS_PER_RUN`), so the new days and the queue are not starved behind it. New days are always read in full.

### Ingested data is evidence

A Business Development Officer decides whether to spend days on a bid. Never seed, mock, or backfill records outside a real ingestion Run. An admin must be able to trust that the queue shows what the pipeline retrieved. Log and surface extraction failures. Never swallow them.

### AI output is a summary, never an authority

Gemini reads the TOR to save a person time. The original PDF stays reachable so a human can verify it before bidding. Do not build flows that discard the source or present extracted fields as confirmed fact.

### A title is not a verdict

Whether work is software is decided from the TOR document, never from the project name. Discovery has no title check, so nothing is kept out of the queue because of what it happens to be called.

### Scope changes are product decisions

The schemas and the Discovery admission rules encode software-only and e-bidding-only. Widening either needs a person's call.

## Commands

`README.md` at the repo root lists them, with setup and CI. Two matter here: run `bun run typecheck` before you say work is done, and run `bun run lint`, which enforces the API's layer boundaries.

## Working in this repo

A new environment variable goes in three places, or it breaks something without an error:

1. `apps/api/src/config/env.ts` (the zod schema)
2. `apps/api/.env.example`
3. The `env` array in `turbo.json`, because Turbo's cache goes stale on undeclared variables

Add it to `docker-compose.yml` too if the container needs it. A variable with no schema default also needs `apps/api/src/testing/env.ts`, or every test that builds an app fails.

Runtime dependencies belong to the workspace that imports them. The root `package.json` holds only repo-wide devDependencies.

Stage your work and stop unless the user asks you to commit or push. Those are the developer's call.

## Per-app guides

Read the one for the app you are changing before you write code.

- [`apps/api/AGENTS.md`](apps/api/AGENTS.md) covers layer boundaries (enforced by ESLint), the composition root, error handling, and the ingestion pipeline internals.
- [`apps/web/AGENTS.md`](apps/web/AGENTS.md) covers the App Router structure, data flow, client auth, and the Next.js version caveat.

Each directory's `CLAUDE.md` is a one-line `@AGENTS.md` import, so every agent gets the same text from one source. Edit the `AGENTS.md`. Never copy its content into a `CLAUDE.md`.

<!-- BEGIN:turborepo-agent-rules -->

# This is NOT the Turborepo you know

Turborepo configuration, task behavior, and CLI commands can vary between installed versions and may differ from your training data. Resolve the `turbo` package from this file's directory or relevant workspace; in monorepos, it may not be visible from the repository root. For example, run `node -p "require.resolve('turbo/package.json')"` from a workspace that depends on `turbo`.

Read `docs/README.md` inside that installed package first, then read the relevant pages from its `docs/` directory before changing Turborepo configuration or commands. Heed deprecation notices. These bundled docs match the installed package version and are available without network access.

This block is written and re-added by `turbo` before repository-scoped commands when an AI agent is detected. In the Turborepo source repository, its template is defined in `crates/turborepo-cli/src/cli/agent_guidance.rs`. Removing the managed block while updates are enabled means a later qualifying invocation will add it again. Set `"agentGuidance": false` in the root `turbo.json` or `turbo.jsonc` to opt out; this does not remove an existing block. Keep the block committed with your work to avoid an uncommitted change on the next agent invocation.
<!-- END:turborepo-agent-rules -->
