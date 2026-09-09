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
`bun run dev` and for the repository tests, which run against real Mongo.

## Endpoints

Everything is under `/api`. Sessions travel as a JWT in an httpOnly cookie.

| Method | Path                             | Access | Does                                           |
| ------ | -------------------------------- | ------ | ---------------------------------------------- |
| GET    | `/health`                        | public | Liveness; touches nothing external             |
| GET    | `/health/dependencies`           | admin  | Live calls to Atlas, Vertex and the open data  |
| POST   | `/auth/register`                 | public | Creates a Business Development Officer         |
| POST   | `/auth/login`                    | public | Signs in; both credential routes are throttled |
| POST   | `/auth/refresh`                  | cookie | Exchanges the refresh cookie                   |
| POST   | `/auth/logout`                   | public | Clears both cookies                            |
| GET    | `/auth/me`                       | user   | The current account                            |
| GET    | `/auth/google`                   | public | Starts the Google sign-in redirect             |
| GET    | `/auth/google/callback`          | public | Finishes it, then redirects into the web app   |
| GET    | `/dashboard`                     | user   | Placeholder greeting                           |
| GET    | `/admin/test`                    | admin  | Placeholder greeting                           |
| GET    | `/ingestion/summary`             | admin  | Counts by state and outcome, plus agencies     |
| GET    | `/ingestion/projects`            | admin  | Filter and paginate procurements               |
| GET    | `/ingestion/projects/:projectId` | admin  | One procurement by its 11-digit id             |
| GET    | `/ingestion/failures`            | admin  | The failure log                                |
| POST   | `/ingestion/run`                 | admin  | Starts a run; `202`, or `409` if one is live   |

Request and response shapes are zod schemas on each route, most of them imported
from `@torfun/types`.

## Health checks

`/health` is the container probe. `/health/dependencies` makes real, billed calls
upstream, so it is something an administrator asks, never something polled.
