# @torfun/web

The torfun front end: Next.js App Router, React 19, Tailwind v4, shadcn/ui.

App structure, data flow and conventions are in `AGENTS.md` beside this file.
This page is how to run it and what the pages are.

## Running

```bash
bun run dev          # http://localhost:3000
bun run typecheck
bun run lint
bun run test         # vitest
bun run test:e2e     # playwright, against a production build
```

The API must be running for anything past the login page. `bun run dev` from the
repo root starts both.

`NEXT_PUBLIC_API_URL` is the only configuration; copy `.env.example` to `.env`.
It defaults to `http://localhost:8080` and is inlined at build time, so changing
it for a deployment means a rebuild, not a restart.

## Pages

| Route                  | Access | What it does                                        |
| ---------------------- | ------ | --------------------------------------------------- |
| `/`                    | public | Landing page, with the search field as its hero     |
| `/search`              | public | Results for `?q=`; says what access the index needs |
| `/login`               | public | Password sign-in, or the Google redirect            |
| `/register`            | public | Self-registration, always as a BD Officer           |
| `/dashboard`           | user   | Signed-in landing                                   |
| `/company-experiences` | user   | The officer's own Company and the work it delivered |
| `/admin/ingestion`     | admin  | Run ingestion, watch progress, read the failure log |
| any unmatched URL      | public | `not-found.tsx`: a 404 with its own search field    |

Protected pages redirect from the server component; the session cookie is
`httpOnly` and unreadable from the browser. `requireCompany` additionally sends a
BD Officer with no Company to `/company-experiences`; administrators are exempt,
and that page must never gate itself or it redirects to itself.

Routes in the `(chrome)` group get the header and footer from
`app/(chrome)/layout.tsx`. The rest — `/login`, `/register`, `/company-experiences`
— deliberately get neither: they are steps in one sign-up flow rather than places
to navigate from, and they show `OnboardingSteps` instead. The group changes no
URL.

`/search` is not gated. A guest who searches from the landing page arrives with
their words intact and is told what the index needs, rather than being redirected
into a form that loses them. The announcement index is served by
`/api/ingestion/projects`, which is **admin-only**, so a BD Officer's search
currently reports that rather than returning rows — opening the index to that
role is an API change, not a UI one.
