# API reference

Baseline: `develop` @ `5e622a3`. The route files in `apps/api/src/routes/` and
their zod schemas in `packages/types` are the source of truth. This page maps
what exists, who may call it and how a request travels. To run the API, see
[`apps/api/README.md`](../apps/api/README.md).

Related: [architecture.md](architecture.md), [data-model.md](data-model.md).
Diagram sources are in [`diagrams/`](diagrams/README.md).

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
| 409 | `ConflictError` | A Run is already live, a client still has recorded work, the last active admin, or a Company's last Company Manager |
| 429 | `TooManyRequestsError` | Rate limit |
| 500 | | A bug. The body is always `"Internal server error"` and the detail goes to the log |

## 2. How a request travels

1. helmet headers, the CORS allowlist and the global rate limit apply to every request.
2. The access JWT is read from the cookie and verified.
3. The route scope's hook runs: `requireAuth` returns 401 without a valid token, `requireAdmin` returns 403 for a non-admin.
4. The route's zod schema validates params, query and body, and returns 400 on failure.
5. The handler calls exactly one service.
6. The service applies the business rules and the audience filter, and throws typed errors.
7. The repository maps between documents and domain objects.
8. The error handler turns a thrown `AppError` into `{ message }` with its status, and the response schema serialises a success.

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
| POST | `/admin/companies/:id/managers` | A | Body `{ user_id }`. Makes an existing member a Company Manager, for a Company whose managers are gone. Never adds a stranger | `204`; `404` not a member |

### TORs

| Method | Path | Acc. | Does | Responses |
| ------ | ---- | ---- | ---- | --------- |
| GET | `/tors` | U | Search and filter procurements, with officer visibility | `200 { items, total, limit, offset }` |
| GET | `/tors/years` | U | The budget years present on stored procurements | `200` |
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

Membership is granted, not claimed (FR-04a, pentest finding P-1). Joining is a
request that a **Company Manager** (M below: a member who manages the caller's
Company) approves. Whoever creates a Company manages it. A pending request
grants nothing: every company-scoped route keys on the account's `company_id`,
which only an approval or creating a Company sets.

| Method | Path | Acc. | Does | Responses |
| ------ | ---- | ---- | ---- | --------- |
| GET | `/companies/search?q=` | U | Typeahead over Thai company names. Returns `id`, `name_th` and `tin` only | `200 { companies }` |
| POST | `/companies` | U | Create a Company, join it and become its manager | `201` with `is_manager: true`; `409` if the caller is the last manager of a Company that still has other members |
| GET | `/companies/me` | U | The caller's Company, with `is_manager` and `auto_approve_domain` | `200`; `404` if none |
| PATCH | `/companies/me` | M | Correct the name or TIN | `200`; `403` not a manager; `404` |
| POST | `/companies/:id/join` | U | Ask to join. Joins at once only if the caller's verified email is at the Company's auto-approve domain | `200 { outcome: "joined", company }`; `202 { outcome: "pending", company }`; `404`; `409` last manager leaving |
| GET | `/companies/join-request` | U | The caller's own pending request | `200 { company, requested_at }`; `404` if none |
| DELETE | `/companies/join-request` | U | Withdraw it | `204` |
| GET | `/companies/me/members` | U | Members of the caller's Company, with `is_manager` | `200 { members }`; `404` |
| GET | `/companies/me/join-requests` | M | Requests waiting on the caller's Company, with each applicant's verified email | `200 { requests }`; `403` |
| POST | `/companies/me/join-requests/:userId/approve` | M | Approve. Conditional on the request still being on file | `204`; `403`; `404` no such request |
| POST | `/companies/me/join-requests/:userId/reject` | M | Reject | `204`; `403`; `404` |
| PUT | `/companies/me/auto-approve` | M | `{ domain }` or `{ domain: null }`. The domain must be the manager's own email domain and not a public mail provider | `200`; `400` public provider or not a domain; `403` not the manager's domain |
| PUT | `/companies/me/members/:userId/manager` | M | `{ is_manager }`: promote or step down a member | `204`; `403`; `404`; `409` last manager |
| DELETE | `/companies/me/members/:userId` | M | Remove a member. Their recorded work stays with the Company | `204`; `403`; `404`; `409` last manager |
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
| GET | `/ingestion/sources` | The Source Registry: `items`, `available` (known agencies not in it), `isDefault`, `updatedAt`, `updatedBy` | `200` |
| POST | `/ingestion/sources` | `{ deptId, deptName }`; `deptId` is 4 to 7 digits | `201`; `400`; `409` duplicate or over 50 |
| PUT | `/ingestion/sources/:deptId` | `{ deptName }` | `200`; `400`; `404` |
| DELETE | `/ingestion/sources/:deptId` | Stops reading the agency from the next Run; deletes no record | `200`; `400`; `404` |

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

`GET /dashboard` (user) only returns a greeting and is not part of the product
surface (system-requirements OI-07).

## 4. Change rules

- Request and response shapes live in `packages/types`. Changing one breaks both apps' compile, which is intended.
- Renaming a wire field breaks `apps/web`. snake_case on the wire is a contract, not a style.
- A new route group gets its own plugin scope, so `requireAuth` or `requireAdmin` is applied once per group.
- Keep the table in [`apps/api/README.md`](../apps/api/README.md#endpoints) in step with this page.
