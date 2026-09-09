# AGENTS.md

Guidance for AI coding agents working in this repository. Claude Code reads it
through the one-line `CLAUDE.md` import beside it.

## What torfun is for

A software house in Bangkok wins work by finding government procurement
announcements it can credibly bid on. Doing that by hand means visiting dozens of
agency sites, opening Thai-language PDFs, and judging one at a time whether a
project is software at all, whether it matches what the company has built before,
and whether the deadline is reachable. Most of that effort is spent discarding
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
   Thai e-GP open data          gprocurement.go.th
   (project announcements)      (TOR document archives)
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

Two stages, deliberately separate. **Discovery** sweeps the open-data API for
announcements and buckets them by a heuristic over Thai project titles.
**Retrieval** downloads the announcement archive for the most promising ones and
extracts TOR PDFs. Discovery is cheap and broad; retrieval is slow, rate-limited,
and capped per run. A record carries both a coarse `state` (Queued → Processing →
Completed/Failed) and a finer `outcome`, because "no TOR was ever published" is a
legitimate upstream answer rather than a failure, and an admin needs to tell them
apart.

`packages/types` holds the domain vocabulary — `Procurement`, `User`,
`MatchResult`, the ingestion records — as zod schemas, and both apps import it.
It is the contract between them: change a schema and both sides fail to compile,
which is the point.

## Guardrails

**Upstream access is conditional.** `gprocurement.go.th` publishes
`robots.txt: Disallow: /`; this project operates under a low-volume research
authorisation. The per-run download cap, the politeness delay between requests,
and the hard stop on a rate-limit response are the terms of that access. They are
not performance tuning. Do not raise them, parallelise around them, or retry past
a rate limit.

**Ingested data is evidence, not decoration.** A BD officer decides whether to
spend days on a bid. Never seed, mock, or backfill records outside a real
ingestion run — an admin must be able to trust that what the queue shows is what
the pipeline actually retrieved. Extraction failures get logged and surfaced, not
swallowed.

**AI output is a summary, never an authority.** Gemini reads the TOR to save a
person time; the original PDF stays reachable so a human can verify before
bidding. Don't build flows that discard the source or present extracted fields as
confirmed fact.

**The title heuristic is directional.** `softwareClass` buckets Thai project names
by pattern matching. It is good enough for triage and not good enough to quote as
a statistic or to hard-filter on without a human path around it.

**Scope changes are product decisions.** Bangkok-only, software-only, and
e-bidding-only are encoded in schemas and pipeline policy. Widening them needs a
person's call.

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
