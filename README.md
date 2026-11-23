# torfun

torfun finds Thai government software procurement that a software house can credibly bid on. It reads the e-GP announcement feed for e-bidding tenders, has Gemini read each TOR (Terms of Reference) PDF to keep the software ones, and scores each against the company's past work. A person reads the ten that matter instead of the four hundred that don't.

It is a Bun and Turborepo monorepo: a Fastify API over MongoDB Atlas and Vertex AI, a Next.js web app, and one package of zod schemas that both apps import.

## Requirements

- Bun 1.3.11, pinned by `packageManager`.
- Docker, for the local MongoDB Atlas container.
- A Google Cloud project with Vertex AI enabled, and `gcloud` for local credentials.
- An e-GP open-data API key from <https://opend.data.go.th/register_api/>. Discovery does not read open data. The key is used to read signed contracts and bid submissions (1000 calls/day) and by the dependency health check; the key is still required by the API config.
- A Google OAuth 2.0 web client, for user sign-in.

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

The `gcloud` line is how the API reaches Vertex AI. It needs a one-time grant first, described in [Vertex AI access](#vertex-ai-access).

Web on <http://localhost:3000>, API on <http://localhost:8080>.

`bun run dev` watches files, and saving one restarts the API and kills any ingestion Run in flight. To let a Run finish, start the API without the watcher (`bun run dev:stable` inside `apps/api`).

Registering through the web app creates a Business Development Officer. The ingestion console at `/admin/ingestion` needs the admin role. Grant it in the database, because nobody can claim it themselves:

```bash
docker compose exec mongodb mongosh mongodb://localhost:27017/torfun \
  --eval 'db.users.updateOne({ username: "you" }, { $set: { role: "admin" } })'
```

MongoDB runs in the `mongodb` container under both `bun run dev` and `docker:up`, so this command works without `mongosh` on the host.

To run the whole stack in containers instead, fill in both `.env` files and run `bun run docker:up`.

## Vertex AI access

In development the API calls Vertex AI by impersonating the `torfun-api-runtime` service account. The tokens are short-lived, there is no key file to leak (the organisation blocks service-account keys), and one IAM change revokes access.

A project owner grants each developer access once, on that service account only:

```bash
gcloud iam service-accounts add-iam-policy-binding \
  torfun-api-runtime@torfun-676767.iam.gserviceaccount.com \
  --member="user:<your-email>" --role="roles/iam.serviceAccountTokenCreator"
```

Then log in as shown above and restart `bun run dev`. IAM changes take a minute or two.

If a Procurement failed analysis, the failure log shows one of these errors:

| Error in the failure log                    | Fix                                                                          |
| ------------------------------------------- | ---------------------------------------------------------------------------- |
| `invalid_grant`, `reauth related error`     | Re-run the login                                                             |
| `iam.serviceAccounts.getAccessToken` denied | The grant above is missing, or you logged in with a different Google account |
| `aiplatform.endpoints.predict` denied       | You logged in without `--impersonate-service-account`; log in again with it  |
| `Invalid JWT`, or a bad key path            | Blank `GOOGLE_APPLICATION_CREDENTIALS` and `GOOGLE_SERVICE_ACCOUNT_JSON`     |

## Commands

Run these from the repo root. Turbo runs each one in every workspace.

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

To run one in a single workspace, add `--filter`, for example `bun run test --filter=@torfun/api`.

## Layout

| Path              | What it is                                                  |
| ----------------- | ----------------------------------------------------------- |
| `apps/api`        | Fastify service: auth, ingestion pipeline, AI analysis      |
| `apps/web`        | Next.js App Router front end                                |
| `packages/types`  | zod schemas both apps import, the contract between them     |
| `packages/config` | Shared TypeScript and ESLint bases                          |
| `docs`            | Requirements, architecture, data model, API, and security   |
| `docs/migrations` | Idempotent `mongosh` scripts for stored-data schema changes |

## Where to read next

- [`GLOSSARY.md`](GLOSSARY.md) defines the domain vocabulary. Read it before naming anything.
- [`AGENTS.md`](AGENTS.md) covers what the product is for, who uses it, and the guardrails around upstream access and AI output. Each app has its own `AGENTS.md` beside it.
- [`docs/`](docs/README.md) holds the requirements, architecture, data model, API reference, and security evidence.

## CI and deployment

Pull requests into `main` run lint, typecheck, unit tests, a build
and Playwright e2e, alongside a security pass: dependency audit, secret scan,
CodeQL, and for `main`, a Trivy image scan and a ZAP baseline against the running
stack.

Merging into `main` deploys nothing. Releases go out from the `deploy` branch:
promote with a fast-forward push (`git push origin main:deploy`, never a force
push). A push to `deploy` (or a `v*` tag) builds both Docker images, Trivy-scans
them, and pushes to Artifact Registry; `deploy` also deploys both to Cloud Run.
The repository variables and Secret Manager secrets it requires are listed at the
top of `.github/workflows/docker.yml`.

## License

MIT. See `LICENSE`.
