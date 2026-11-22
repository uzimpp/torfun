# @torfun/api

The Fastify service behind torfun: accounts and sessions, the e-GP ingestion
pipeline, and the Vertex AI reading of TOR documents. Runs on Bun, stores in
MongoDB Atlas.

Architecture, layer rules and ingestion internals are in `AGENTS.md` beside this
file. This page is how to run it.

## Running

```bash
bun run dev        # watch mode on http://localhost:8080
bun run typecheck
bun run lint
bun test                                 # all
bun test src/routes/ingestion.test.ts    # one file
bun run build && bun run start           # production build
```

Configuration comes from `.env` in this directory — copy `.env.example` and read
its comments, which cover how to authenticate to Google in each environment.
A local MongoDB (`docker compose up -d mongodb` from the repo root) is needed for
`bun run dev` and for the repository tests, which run against real Mongo. They
skip unless `MONGODB_TEST_URI` (or `MONGODB_URI`) is set; for the local image use
`MONGODB_TEST_URI='mongodb://127.0.0.1:27017/torfun-test?directConnection=true'`.

## Endpoints

Everything is under `/api`. Sessions travel as a JWT in an httpOnly cookie.

| Method | Path                                                | Access | Does                                                   |
| ------ | --------------------------------------------------- | ------ | ------------------------------------------------------ |
| GET    | `/health`                                           | public | Liveness; touches nothing external                     |
| GET    | `/health/dependencies`                              | admin  | Live calls to Atlas, Vertex and the open data          |
| POST   | `/auth/register`                                    | public | Creates a Business Development Officer                 |
| POST   | `/auth/login`                                       | public | Signs in; both credential routes are throttled         |
| POST   | `/auth/refresh`                                     | cookie | Exchanges the refresh cookie                           |
| POST   | `/auth/logout`                                      | public | Clears both cookies                                    |
| GET    | `/auth/me`                                          | user   | The current account                                    |
| GET    | `/auth/google`                                      | public | Starts the Google sign-in redirect                     |
| GET    | `/auth/google/callback`                             | public | Finishes it, then redirects into the web app           |
| GET    | `/dashboard`                                        | user   | Placeholder greeting                                   |
| GET    | `/admin/users`                                      | admin  | Lists accounts                                         |
| PATCH  | `/admin/users/:id`                                  | admin  | Updates an account's role or active status             |
| GET    | `/ingestion/summary`                                | admin  | Counts by state and outcome, plus agencies             |
| GET    | `/ingestion/projects`                               | admin  | Filter and paginate procurements                       |
| GET    | `/ingestion/projects/:projectId`                    | admin  | One procurement by its 11-digit id                     |
| GET    | `/ingestion/failures`                               | admin  | The failure log                                        |
| GET    | `/ingestion/ops`                                    | admin  | Current ingestion operation status                     |
| POST   | `/ingestion/run`                                    | admin  | Starts a run; `202`, or `409` if one is live           |
| POST   | `/ingestion/run/stop`                               | admin  | Requests the active run to stop                        |
| GET    | `/ingestion/recent?limit=`                          | admin  | The most recently ingested procurements                |
| GET    | `/ingestion/schedule`                               | admin  | Reads the automatic run schedule                       |
| PUT    | `/ingestion/schedule`                               | admin  | Updates the automatic run schedule                     |
| POST   | `/ingestion/procurements/:projectId/approve`        | admin  | Approves a held procurement                            |
| POST   | `/ingestion/procurements/:projectId/non-software`   | admin  | Marks a procurement as non-software                    |
| POST   | `/ingestion/procurements/:projectId/read-anyway`    | admin  | Queues a held procurement for retrieval                |
| DELETE | `/ingestion/procurements/:projectId?allowReimport=` | admin  | Deletes a procurement; controls whether it can return  |
| GET    | `/ingestion/tombstones`                             | admin  | Lists deleted-project tombstones                       |
| DELETE | `/ingestion/tombstones/:projectId`                  | admin  | Removes a tombstone                                    |
| POST   | `/ingestion/tombstones/:projectId/restore`          | admin  | Restores a tombstone and queues retrieval              |
| GET    | `/tors/years`                                       | user   | Available budget years                                 |
| GET    | `/tors`                                             | user   | Search, filter and paginate procurements               |
| GET    | `/tors/:projectId`                                  | user   | One procurement by its project id                      |
| GET    | `/tors/:projectId/contracts`                        | user   | Awarded contracts; optional `contract_year`            |
| GET    | `/tors/:projectId/contract-submissions`             | user   | Bid submissions; optional `contract_year`              |
| GET    | `/tors/:projectId/budget-comparison`                | user   | Planned budget against similar earlier procurements    |
| POST   | `/tors/:projectId/similar-awards`                   | user   | Past awards found by similar name (spends quota)       |
| GET    | `/tors/:projectId/source`                           | user   | Download the original TOR PDF                          |
| POST   | `/tors/:projectId/reports`                          | user   | Report a TOR for admin review                          |
| GET    | `/admin/tor-reports`                                | admin  | Shared report queue, newest first                      |
| PATCH  | `/admin/tor-reports/:reportId`                      | admin  | Dismiss a report or remove its TOR from publication    |
| GET    | `/companies/search?q=`                              | user   | Typeahead over Thai company names                      |
| POST   | `/companies`                                        | user   | Creates a Company and joins the caller to it           |
| GET    | `/companies/me`                                     | user   | The caller's Company; `404` when they have none        |
| PATCH  | `/companies/me`                                     | user   | Corrects the caller's own Company                      |
| POST   | `/companies/:id/join`                               | user   | Repoints the caller at an existing Company             |
| GET    | `/clients`                                          | user   | The caller's own Clients                               |
| GET    | `/clients/suggestions?kind=&q=`                     | user   | `{ suggestions }`, government names from agencies      |
| POST   | `/clients`                                          | user   | Records a Client; `409` before a Company exists        |
| PATCH  | `/clients/:id`                                      | user   | Corrects one                                           |
| DELETE | `/clients/:id`                                      | user   | Removes one; `409` if work is recorded on it           |
| GET    | `/experiences`                                      | user   | The caller's own recorded work                         |
| POST   | `/experiences`                                      | user   | Records work; only client and name are required        |
| PATCH  | `/experiences/:id`                                  | user   | Corrects one                                           |
| DELETE | `/experiences/:id`                                  | user   | Removes one                                            |
| GET    | `/favorites`                                        | user   | The caller's favorited TORs, with each procurement     |
| GET    | `/favorites/:projectId`                             | user   | `{ favorited }` for one project                        |
| POST   | `/favorites`                                        | user   | Favorites a project; `404` if the caller cannot see it |
| DELETE | `/favorites/:projectId`                             | user   | Unfavorites one; `404` if it was not favorited         |

Request and response shapes are zod schemas on each route, most of them imported
from `@torfun/types`.

No route under `/companies`, `/clients` or `/experiences` accepts a company id
from its caller — the Company is read from the session user, so an id belonging
to another vendor is a `404` rather than a leak. `/companies/:id/join` is the one
exception, and naming another Company is the whole point of it.

## Procurement deadline filters

`GET /api/tors` accepts `status` values from the e-GP lifecycle and `budgetYear`
values from the fiscal years stored on procurements. Either filter can contain
multiple values; matching any selected status or year is sufficient. The endpoint
also accepts the existing budget, agency, announcement date, technology, platform,
and project-name criteria.

`minDaysLeft=3` selects open tenders with a known deadline at least three Thai
calendar days from today; `0` includes deadlines today. Day counts allow 0 through 365. Choose either `minDaysLeft` or `deadlineFrom`/`deadlineTo`, never both.
Missing or unreadable deadlines do not match a date filter. AI-extracted deadlines
must be verified against the original TOR before bidding.

## TOR reports

Authenticated users submit one reason and optional `details` (maximum 2,000
characters). The `other` reason requires nonblank details. The API records the
reporter's identity from their account and snapshots the TOR title and agency.
It returns `201`; another pending report from the same user for that TOR returns
`409`. Different users can report the same TOR.

Reports persist in `tor_reports`. Every active admin can read the queue with
`limit` (default 25, maximum 100), `offset`, and `status` (`pending`, `dismissed`,
`removed`, or `all`; default `pending`). The reporter's identity stays visible.

`PATCH /api/admin/tor-reports/:reportId` accepts
`{ "action": "dismiss" | "remove_tor", "note"?: "..." }`. Notes are trimmed and
limited to 2,000 characters. Each decision records the verified administrator's
identity and time. A report can only be decided once; stale requests return `409`.
Decisions are per report. If another report already removed the same TOR, a
second removal returns `409` and leaves that report pending so an administrator
can dismiss it. The original removal retains its author and report ID.

Dismissal leaves publication unchanged. Removal marks the procurement with
`publication_removed_at`, `publication_removed_by`, and `publication_removed_report_id`.
Search and favorites exclude removed TORs for all users. Admins can open the
original record and source from the Removed filter in TOR Reports. Rediscovery
or retrieval does not republish it.
The agency's own procurement status and ingestion outcome are not changed.
Reporting by itself never changes publication. Removal cannot be undone through the app.

Review decisions and publication removal commit in one MongoDB transaction, so
a replica set is required (Atlas already provides one). A failed write rolls back
the decision, and competing reviewers cannot overwrite each other. Index setup
is idempotent and runs lazily. Legacy pending reports need no backfill. Missing
publication metadata means published.

## Contract snapshots

Each ingestion run syncs GovSpending contract snapshots for the current fiscal
year and the four before it (2566–2570 as of November 2026), then fetches bid
submissions for projects with awarded contracts. Each stored bid keeps its
line item, and its price is parsed from the API's numeric string (an unreadable
one is stored empty and counted in a warning).
Pagination and retries share one per-run quota budget. A 24-hour cooldown is
stored in MongoDB after a refusal or exhausted quota, so later runs and restarted
API instances do not call either GovSpending endpoint until it expires.

## Similar awards

`POST /api/tors/:projectId/similar-awards` looks for past awards whose project name
resembles the TOR's, in the contract data, and returns their winners, agreed prices
and bidders. It is a POST so that only a click spends the daily open-data allowance:
at most 3 searches and 10 bidder lookups per request, no retries, the same 24-hour
cooldown after a refusal, and results kept in memory for 24 hours. Matches are by name
only and are not confirmed to be the same kind of work.

## Health checks

`/health` is the container probe. `/health/dependencies` makes real, billed calls
upstream, so it is something an administrator asks, never something polled.

## Notifications

BD officers use `/settings` for account details, a setup checklist and notification
preferences; `/notifications` remains the inbox. Admins inspect delivery failures at
`/admin/notifications`.

- `match_found` uses the same structured qualification score as TOR detail and
  search. It requires at least 70% and no clause marked `not_met`; unknown clauses
  stay unknown and appear in the reasons. A score is never a bid-eligibility guarantee.
- `status_changed` covers status and bid-deadline changes on a previously matching
  **or favorited** TOR, independent of its current score. The first observation is
  a baseline, not an invented historical change.
- `new_open` is a separate opt-in for published, open software e-bidding TORs. It
  works without a company or experience record. When a first match is also due,
  one match alert takes precedence over a duplicate new-open alert.
- Every event supports independent in-app/email/LINE choices and saved filters:
  exact agency names, inclusive budget bounds, work platform(s) from TOR analysis,
  and a minimum qualification score. Missing evidence fails an enabled filter.
  Queued deliveries recheck current preferences, filters and company evidence.

Email and LINE default off and require verified/linked destinations. New-open
notifications default off; enable them explicitly in settings. Existing preference
records read with compatible defaults; `docs/migrations/notification-policy.js`
provides an optional idempotent metadata migration. Old technology-based alerts
retain their scoring-version label rather than being relabeled as qualifications.

Existing TORs without structured qualifications remain unscored. Their summaries
and source PDFs remain available. There is no synthetic backfill or extra upstream
sweep: scores appear when a legitimate ingestion/retrieval reads a full TOR again
under the existing gate and re-read policy. New-open alerts remain available for
published legacy TORs without structured qualifications.

Optional SMTP and LINE Messaging API variables are listed in `.env.example`.
Set `WEB_APP_URL` to the public web origin for message links. LINE's webhook is
`POST /api/notifications/line/webhook`; users add the OA and send `เชื่อมต่อ` to
begin account linking. Messages use branded HTML email (with plain text) and
LINE Flex cards with TOR and preference links.

Mongo must support transactions. Source indexes are ensured at startup; worker
passes ensure notification/contact indexes. In production, a trusted scheduler
must call `POST /api/internal/notifications/run` every minute with the
`X-Notification-Worker-Token` header matching `NOTIFICATION_WORKER_TOKEN`.
Development polls locally via `NOTIFICATION_POLL_MS`. Delivery retries are bounded
to five attempts within 24 hours; provider acceptance does not confirm receipt.
