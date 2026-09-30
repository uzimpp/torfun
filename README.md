# torfun

Finds Thai government software procurement a software house can credibly bid
on. It sweeps the e-GP open data, keeps the software-related announcements,
has Gemini read the TOR (Terms of Reference) PDF, and scores each against the
company's own past work — so a person reads the ten that matter instead of the
four hundred that don't.

A Bun + Turborepo monorepo: a Fastify API over MongoDB Atlas and Vertex AI, and a
Next.js web app, sharing one package of zod schemas.

## Requirements

- **Bun 1.3.11** — pinned by `packageManager`
- **Docker** — for the local MongoDB Atlas container
- **A Google Cloud project** with Vertex AI enabled, plus `gcloud` for local credentials
- **An e-GP open-data API key** — register at <https://opend.data.go.th/register_api/>
- **A Google OAuth 2.0 web client** — for user sign-in

## Running it locally

```bash
bun install
cp apps/api/.env.example apps/api/.env   # the comments there explain every value
cp apps/web/.env.example apps/web/.env
docker compose up -d mongodb
gcloud auth application-default login \
  --impersonate-service-account=torfun-api-runtime@torfun-676767.iam.gserviceaccount.com
bun run dev
```

The `gcloud` line is how the API reaches Vertex AI; it needs a one-time grant
first — see [Vertex AI access](#vertex-ai-access).

Web on <http://localhost:3000>, API on <http://localhost:8080>.

`bun run dev` watches files, and saving any of them restarts the API and kills an
ingestion run in flight. To let a run finish, start the API without the watcher
(`bun run dev:stable` inside `apps/api`) and edit freely.

Registering through the web app creates a Business Development Officer. The
ingestion console at `/admin/ingestion` needs the admin role, which is granted in
the database and never self-claimed:

```bash
docker compose exec mongodb mongosh mongodb://localhost:27017/torfun \
  --eval 'db.users.updateOne({ username: "you" }, { $set: { role: "admin" } })'
```

Mongo runs in the `mongodb` container either way (`bun run dev` or `docker:up`), so this reaches
it without needing `mongosh` installed on the host.

To run the whole stack in containers instead, fill both `.env` files and use
`bun run docker:up`.

## Vertex AI access

In development the API calls Vertex AI by impersonating the `torfun-api-runtime`
service account: short-lived tokens, nothing to leak, and one IAM change revokes
it. (The org blocks service-account keys, so there is no key file to hand out.)

An owner grants each developer access once, on that service account only:

```bash
gcloud iam service-accounts add-iam-policy-binding \
  torfun-api-runtime@torfun-676767.iam.gserviceaccount.com \
  --member="user:<your-email>" --role="roles/iam.serviceAccountTokenCreator"
```

Then log in as shown above and restart `bun run dev`. IAM changes take a minute or
two. Records that failed analysis keep their stored archives, so a retry does not
re-download.

| Error in the failure log                    | Fix                                                                          |
| ------------------------------------------- | ---------------------------------------------------------------------------- |
| `invalid_grant`, `reauth related error`     | Re-run the login                                                             |
| `iam.serviceAccounts.getAccessToken` denied | The grant above is missing, or you logged in with a different Google account |
| `aiplatform.endpoints.predict` denied       | You logged in without `--impersonate-service-account`; log in again with it  |
| `Invalid JWT`, or a bad key path            | Blank `GOOGLE_APPLICATION_CREDENTIALS` and `GOOGLE_SERVICE_ACCOUNT_JSON`     |

## Commands

Run from the repo root; Turbo fans out to every workspace.

| Command             | Does                                               |
| ------------------- | -------------------------------------------------- |
| `bun run dev`       | API and web together, in watch mode                |
| `bun run typecheck` | Every workspace; run before calling work done      |
| `bun run lint`      | ESLint, including the API's layer boundaries       |
| `bun run test`      | Unit tests (a local MongoDB must be running)       |
| `bun run test:e2e`  | Playwright, against a production build             |
| `bun run build`     | Both apps                                          |
| `bun run format`    | Prettier over the repo                             |
| `bun run docker:up` | Build and start mongodb, api and web in containers |

Scope any of them to one workspace with `--filter`, for example
`bun run test --filter=@torfun/api`.

## Layout

| Path              | What it is                                                  |
| ----------------- | ----------------------------------------------------------- |
| `apps/api`        | Fastify service: auth, ingestion pipeline, AI analysis      |
| `apps/web`        | Next.js App Router front end                                |
| `packages/types`  | zod schemas both apps import — the contract between them    |
| `packages/config` | Shared TypeScript and ESLint bases                          |
| `docs/adr`        | Decisions that are expensive to reverse, and why            |
| `docs/migrations` | Idempotent `mongosh` scripts for stored-data schema changes |

## Where to read next

- **`CONTEXT.md`** — the domain vocabulary. Read it before naming anything.
- **`AGENTS.md`** — what the product is for, who uses it, and the guardrails
  around upstream access and AI output. Each app has its own beside it.
- **`docs/adr/`** — why the shape is the way it is.

## CI and deployment

Pull requests into `develop` or `main` run lint, typecheck, unit tests, a build
and Playwright e2e, alongside a security pass: dependency audit, secret scan,
CodeQL, and for `main`, a Trivy image scan and a ZAP baseline against the running
stack.

Pushes to `main` and `v*` tags build both Docker images, Trivy-scan them, and push
to Artifact Registry; `main` also deploys both to Cloud Run. The repository
variables and Secret Manager secrets it requires are listed at the top of
`.github/workflows/docker.yml`.

## License

MIT — see `LICENSE`.
