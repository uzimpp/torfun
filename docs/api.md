# API reference

Baseline: `develop` @ `5e622a3`. The route files in `apps/api/src/routes/` and
their zod schemas in `packages/types` are the source of truth. This page maps
what exists, who may call it and how a request travels. To run the API, see
[`apps/api/README.md`](../apps/api/README.md).

Related: [architecture.md](architecture.md), [data-model.md](data-model.md).
Diagram sources are in [`diagrams/`](diagrams/README.md).

![API route map](diagrams/png/11-api-route-map.png)

## 1. Conventions

| Topic | Rule |
| ----- | ---- |
| Base path | Everything is under `/api`. Locally, `http://localhost:8080` |
| Format | JSON in and out. Wire fields are snake_case. The `Procurement` schema from `@torfun/types` is camelCase |
| Authentication | Two `httpOnly` cookies: `torfun_token` (access JWT, 15 minutes) and `torfun_refresh` (30 days, rotating). Cookies are `secure` in production. Browser calls need `credentials: 'include'` |
| Access levels | `public`, `user` (any signed-in account) and `admin` |
| Validation | Every route has a zod schema for params, query, body and response. Invalid input returns `400` with `{ message, errors }` |
| Pagination | `limit` (default 50, max 200) and `offset`; responses carry `{ items, total, limit, offset }`. TOR reports default to 25 and cap at 100 |
| CORS | Allowlist from `CORS_ORIGINS`, credentials allowed |
| Rate limits | 100 requests per minute per IP. Login and register also allow 30 per 15 minutes per IP and 10 per 15 minutes per account |

| Status | Raised as | Typical cause |
| ------ | --------- | ------------- |
| 400 | `BadRequestError`, validation | Bad input |
| 401 | `UnauthorizedError` | No, expired or revoked session |
| 403 | `ForbiddenError` | Signed in but not allowed, or a deactivated account |
| 404 | `NotFoundError` | Missing, or not visible to this role. An officer asking for a held record gets 404, not 403 |
| 409 | `ConflictError` | A Run is already live, a client still has recorded work, or the last active admin |
| 429 | `TooManyRequestsError` | Rate limit |
| 500 | | A bug. The body is always `"Internal server error"` and the detail goes to the log |

## 2. How a request travels

![API request lifecycle](diagrams/png/10-api-request-lifecycle.png)

Visibility is enforced in the service, not the route. `/tors/*` and
`/ingestion/projects*` read the same data with an audience, `officer` or `admin`.
An officer only sees `tor_analysed` records that were not removed from
publication, with admin-only fields (`holdReason`, `approved`) blanked.

Long work is started, not awaited. `POST /ingestion/run` returns `202`
immediately and the web app polls `/ingestion/ops` for progress.

## 3. Endpoints

Access: P public, U signed-in user, A admin.

### Health

| Method | Path | Acc. | Does | Responses |
| ------ | ---- | ---- | ---- | --------- |
| GET | `/health` | P | Liveness; touches nothing external | `200 { status, uptimeSeconds }` |
| GET | `/health/dependencies` | A | Live probes of MongoDB, Vertex AI and the open-data API | `200` |

### Authentication and accounts

| Method | Path | Acc. | Does | Responses |
| ------ | ---- | ---- | ---- | --------- |
| POST | `/auth/register` | P | Creates a Business Development Officer and signs them in | `201`; `409` username taken; `429` |
| POST | `/auth/login` | P | Username and password; sets both cookies | `200`; `400`; `401` bad credentials; `403` deactivated; `429` |
| POST | `/auth/refresh` | cookie | Exchanges the refresh cookie for a new pair. Reusing a revoked token revokes the whole family | `200`; `401` |
| POST | `/auth/logout` | P | Revokes the refresh family and clears both cookies | `200` |
| GET | `/auth/me` | U | The current account, with `company_name` | `200`; `401` |
| GET | `/auth/google` | P | Starts the Google redirect | `302` |
| GET | `/auth/google/callback` | P | Finishes sign-in, sets cookies, redirects to `WEB_APP_URL` | `302` |
| GET | `/admin/users` | A | All accounts | `200 { users }` |
| PATCH | `/admin/users/:id` | A | Body `{ role?, is_active? }`, at least one. Grants or revokes `admin`, activates or deactivates | `200`; `403` own account; `404`; `409` last active admin |

### TORs

| Method | Path | Acc. | Does | Responses |
| ------ | ---- | ---- | ---- | --------- |
| GET | `/tors` | U | Search and filter procurements, with officer visibility | `200 { items, total, limit, offset }` |
| GET | `/tors/:projectId` | U | One procurement, with officer visibility | `200`; `404` |
| GET | `/tors/:projectId/source` | U | The original main-TOR PDF as an attachment, downloaded from e-GP by `zipId` | `200 application/pdf`; `404` |
| POST | `/tors/:projectId/reports` | U | Report a TOR with `{ reason, details? }`; `details` is required for `other` | `201` |

`GET /tors` query parameters (`ProcurementListQuerySchema`):

| Group | Parameters |
| ----- | ---------- |
| Text | `q` (up to 200 characters), `deptName`, `industry` (a keyword match on project and agency names) |
| Lifecycle | `status` (Procurement Status), `state`, `outcome`, `budgetYear` |
| Money | `minBudget`, `maxBudget` |
| Dates (`YYYY-MM-DD`) | `publishedFrom`, `publishedTo`, `deadlineFrom`, `deadlineTo` |
| Time left | `minDaysLeft` (0 to 365, Thai calendar days); cannot be combined with a deadline range |
| Analysis | `techStack`, `targetPlatforms` (comma separated, up to 20 values) |
| Paging | `limit`, `offset` |

A range whose maximum is below its minimum returns `400`.

### My TOR and reports

| Method | Path | Acc. | Does | Responses |
| ------ | ---- | ---- | ---- | --------- |
| GET | `/favorites` | U | The caller's favourites that they can still see | `200 { favorites }` |
| GET | `/favorites/:projectId` | U | Whether it is favourited | `200 { favorited }` |
| POST | `/favorites` | U | Favourite a project with `{ project_id }` | `201`; `404` if not visible |
| DELETE | `/favorites/:projectId` | U | Remove | `204`; `404` |
| GET | `/admin/tor-reports` | A | The report queue. `status` is `pending` (default), `dismissed`, `removed` or `all` | `200 { items, total, limit, offset }` |
| PATCH | `/admin/tor-reports/:reportId` | A | `{ action: "dismiss" or "remove_tor", note? }`. `remove_tor` unpublishes the TOR | `200` |

### Vendor record

Clients and Experience belong to the caller's Company. Another Company's records
behave as if they do not exist.

| Method | Path | Acc. | Does | Responses |
| ------ | ---- | ---- | ---- | --------- |
| GET | `/companies/search?q=` | U | Typeahead over Thai company names | `200 { companies }` |
| POST | `/companies` | U | Create a Company and join it | `201` |
| GET | `/companies/me` | U | The caller's Company | `200`; `404` if none |
| PATCH | `/companies/me` | U | Correct it | `200`; `404` |
| POST | `/companies/:id/join` | U | Point the caller at an existing Company | `200`; `404` |
| GET | `/clients` | U | The caller's Clients | `200 { clients }` |
| GET | `/clients/suggestions?kind=&q=` | U | Government names drawn from agencies already seen | `200 { suggestions }` |
| POST | `/clients` | U | Record a Client | `201`; `409` before a Company exists |
| PATCH | `/clients/:id` | U | Correct | `200`; `404` |
| DELETE | `/clients/:id` | U | Remove | `204`; `409` if work is recorded against it |
| GET | `/experiences` | U | The caller's recorded work | `200 { experiences }` |
| POST | `/experiences` | U | Record work (client and project name required) | `201` |
| PATCH | `/experiences/:id` | U | Correct | `200` |
| DELETE | `/experiences/:id` | U | Remove | `204` |

### Ingestion operations (admin)

| Method | Path | Does | Responses |
| ------ | ---- | ---- | --------- |
| GET | `/ingestion/summary` | Counts by State and Outcome, plus agency names | `200` |
| GET | `/ingestion/projects` | Every procurement, with the `/tors` query plus `state` and `outcome` | `200` |
| GET | `/ingestion/projects/:projectId` | One procurement, full record | `200`; `404` |
| GET | `/ingestion/failures` | The failure log (stage, kind `fault` or `no_tor`) | `200 { items }` |
| GET | `/ingestion/ops` | Run state, live work, history and trends | `200` |
| GET | `/ingestion/recent?limit=` | Most recently updated records (default 5, clamped to 20) | `200 { items }` |
| POST | `/ingestion/run` | Start a Run (empty body) | `202 { started, message }`; `409` a Run is live |
| POST | `/ingestion/run/stop` | Graceful stop; the requester comes from the session | `202 { stopping }`; `409` none running |
| GET | `/ingestion/schedule` | The schedule plus `lastRunAt`, `nextRunAt`, `upcomingRunAts` | `200` |
| PUT | `/ingestion/schedule` | `{ enabled, mode, timeOfDay, weekdays, everyHours }`; `everyHours` is 6 to 168 | `200`; `400` |

### Moderation (admin)

| Method | Path | Does | Responses |
| ------ | ---- | ---- | --------- |
| POST | `/ingestion/procurements/:projectId/approve` | Approve a held record so officers can see it | `204`; `404`; `409` |
| POST | `/ingestion/procurements/:projectId/non-software` | Mark non-software and write a tombstone | `204`; `404` |
| POST | `/ingestion/procurements/:projectId/read-anyway` | Read an `out_of_scope` project after all (a one-project Run) | `202`; `404`; `409` |
| DELETE | `/ingestion/procurements/:projectId?allowReimport=true\|false` | Delete. `allowReimport` is required: whether the runner may pull the project again is the admin's decision, never a default | `204`; `404` |
| GET | `/ingestion/tombstones` | List tombstones | `200 { items }` |
| DELETE | `/ingestion/tombstones/:projectId` | Remove a tombstone | `204`; `404` |
| POST | `/ingestion/tombstones/:projectId/restore` | Lift the tombstone and retrieve again (a one-project Run) | `202`; `404`; `409` |

### Placeholders

`GET /dashboard` (user) and `GET /admin/test` (admin) only return a greeting and
are not part of the product surface (system-requirements OI-07).

## 4. Sequences

An officer finds, reads and verifies a TOR:

![Officer reads a TOR](diagrams/png/12-seq-officer-reads-tor.png)

An administrator starts a Run, watches it and stops it:

![Administrator runs ingestion](diagrams/png/13-seq-admin-run.png)

An administrator resolves a held record:

![Administrator resolves a held record](diagrams/png/14-seq-admin-moderation.png)

Sign-in, refresh and Google are in [architecture.md](architecture.md#5-runtime).

## 5. Change rules

- Request and response shapes live in `packages/types`. Changing one breaks both apps' compile, which is intended.
- Renaming a wire field breaks `apps/web`. snake_case on the wire is a contract, not a style.
- A new route group gets its own plugin scope, so `requireAuth` or `requireAdmin` is applied once per group.
- Keep the table in [`apps/api/README.md`](../apps/api/README.md#endpoints) in step with this page.
