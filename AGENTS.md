# AGENTS.md

Guidance for AI coding agents working in this repository. Claude Code reads it
through the one-line `CLAUDE.md` import beside it.

## What torfun is for

A software house wins work by finding government procurement announcements it can
credibly bid on. Doing that by hand means visiting dozens of agency sites,
opening Thai-language PDFs, and judging one at a time whether a project is
software at all, whether it matches what the company has built before, and
whether the deadline is reachable. Most of that effort is spent discarding
things.

torfun automates the discarding. It pulls procurement announcements, keeps the
software-related ones, extracts what a Terms of Reference (TOR) document actually
asks for, and scores each against the company's own past experience — so a person
reads the ten that matter instead of the four hundred that don't.

Scope is deliberately narrow: **software procurement, e-bidding tenders**.
Widening any of those is a product decision, not a refactor.

## Who uses it

| Role                         | Value in code                  | Does                                                                                                                                     |
| ---------------------------- | ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Business Development Officer | `business_development_officer` | Searches and filters TORs, reads AI summaries, checks match scores, follows a TOR back to its source document before committing to a bid |
| Site Administrator           | `admin`                        | Runs and monitors ingestion, reviews the failure log, manages accounts                                                                   |

Self-registration always creates a BD officer. Admin is granted, never claimed.

## How the pieces fit

```
   e-GP announcement feed       e-GP project pages
   (process3 RSS, by day)       (timeline, TOR archives)
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

Two stages, deliberately separate. **Discovery** reads e-GP's announcement feed,
one Source Registry agency and one day at a time, for e-bidding draft TORs and
invitations, and admits those not tombstoned; the title is never consulted. It
asks about the days since the last Run first, then a share of the past year
(ADR-0018). A project not yet stored has its e-GP project detail read first,
for its real budget year, and is stored only once that succeeds (ADR-0019). The
open-data API is not read: it holds only signed contracts (ADR-0004). Both
stages reach `gprocurement.go.th`. **Retrieval** downloads the announcement
archive for each admitted one, newest first, and extracts TOR PDFs. Each
project's status and bid deadline come from its e-GP announcement timeline
(greenBook), read first; projects already read have the timeline read again on
later Runs, oldest check first, and are retrieved again only if the invitation
moved. Discovery is one request per agency per day, plus one per new project;
retrieval is several per project and the model's reading on top. A record
carries both a coarse `state` (Queued → Processing → Completed/Failed) and a finer `outcome`, because "no TOR was ever published" is a
legitimate upstream answer rather than a failure, and an admin needs to tell them
apart.

`packages/types` holds the domain vocabulary — `Procurement`, `User`,
`MatchResult`, the ingestion records — as zod schemas, and both apps import it.
It is the contract between them: change a schema and both sides fail to compile,
which is the point.

## Guardrails

**Upstream access is conditional.** `gprocurement.go.th` publishes
`robots.txt: Disallow: /`; this project operates under a research authorisation
whose own limits are not recorded in this repository. What the code does to stay
within the spirit of it: requests are single-file through one gate, the politeness
delay follows each, a rate-limit or forbidden response stops every runner at once,
and only one Run goes at a time. Every request to the site is one of these: the
announcement feed Discovery reads (one agency, one type, one day), the project
detail (one per project, when it is first stored or was never read), and for each
project its announcement timeline (greenBook), the archive lookup and the download,
all inside one gate hold. The process5 project search sits behind Cloudflare
Turnstile and is never called; do not add a captcha solver, a copied browser token
or a headless browser to reach it. They are not performance tuning. Do not parallelise
around them or retry past a refusal. **No volume cap is applied** — a Run works
through the whole queue — by the owner's decision (ADR-0015); if the site's owner
ever states a limit, it belongs back in code, not in this paragraph. The one
exception is Discovery's history: reading the past year takes a fixed share of
each Run (`FEED_BACKFILL_REQUESTS_PER_RUN`, ADR-0018), so the new days and the
queue are not starved behind it. New days are always read in full.

**Ingested data is evidence, not decoration.** A BD officer decides whether to
spend days on a bid. Never seed, mock, or backfill records outside a real
ingestion run — an admin must be able to trust that what the queue shows is what
the pipeline actually retrieved. Extraction failures get logged and surfaced, not
swallowed.

**AI output is a summary, never an authority.** Gemini reads the TOR to save a
person time; the original PDF stays reachable so a human can verify before
bidding. Don't build flows that discard the source or present extracted fields as
confirmed fact.

**A title is not a verdict.** Whether work is software is decided from the TOR
document, never from the project name; discovery has no title check, so nothing is
quietly kept out of the queue by what it happens to be called.

**Scope changes are product decisions.** Software-only and e-bidding-only are
encoded in the schemas and in what discovery admits. Widening them needs a person's call.

## Commands

`README.md` at the repo root has them, along with setup and CI. Two matter here:
`bun run typecheck` before claiming work is done, and `bun run lint`, which
enforces the API's layer boundaries.

## Working in this repo

New env vars go in three places or they silently break something:
`apps/api/src/config/env.ts` (zod), `apps/api/.env.example`, and the `env` array in
`turbo.json` (undeclared vars poison Turbo's cache). Add it to `docker-compose.yml`
too if the container needs it. A var with no schema default needs a fourth:
`apps/api/src/testing/env.ts`, or every test that builds an app fails.

Runtime dependencies belong to the workspace that imports them. The root
`package.json` holds only repo-wide devDependencies.

Stage your work and stop — committing and pushing are the developer's call.

## Per-app architecture

Read the one for the app you're touching before writing code:

- **`apps/api/AGENTS.md`** — layer boundaries (enforced by ESLint), composition
  root, error handling, ingestion pipeline internals.
- **`apps/web/AGENTS.md`** — App Router structure, data flow, client auth, and the
  Next.js version caveat.

Each directory's `CLAUDE.md` is a one-line `@AGENTS.md` import, so Claude Code and
every agent that reads `AGENTS.md` get the same text from one source. Edit the
`AGENTS.md`; never duplicate content into a `CLAUDE.md`.
