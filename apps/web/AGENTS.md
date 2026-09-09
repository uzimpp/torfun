<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# apps/web — agent guide

Next.js App Router, React 19, Tailwind v4, shadcn/ui. Read the root `AGENTS.md`
first for what the product does and who uses it. The block above is not optional —
consult `node_modules/next/dist/docs/` before writing components.

Commands, configuration and the page list are in `README.md` beside this file.
Note that `bun run typecheck` runs `next typegen` first, and a single unit test is
`bunx vitest run src/app/page.test.tsx`.

## Structure

```
src/
  app/            routes; page.tsx is the route, colocated by URL
  components/
    ui/           shadcn primitives — generated, don't hand-edit
    auth/         login/session UI
    ingestion/    admin ingestion console
  lib/            api client, session helpers, config
```

## Data flow

**Server components read the session.** `requireUser()` / `requireAdmin()` in
`lib/auth.ts` return the user or redirect. Use them on every protected page rather
than calling `getCurrentUser()` and branching — a page that forgets the branch
renders for anyone. The session cookie is `httpOnly`, so this only works
server-side.

**Client components use `lib/api.ts`.** It sends `credentials: 'include'` (the API
is a separate origin and admin routes need the cookie) and throws `ApiError` with a
status, distinguishing a network failure (status `0`) from a 500 so the UI can say
"can't reach the API" rather than "the API is broken". Keep that distinction.

Interactive consoles follow the ingestion pattern: a `use*Data` hook owns fetching
and polling, the component owns filter and UI state, presentation splits into
sibling components. Don't grow a single client component past both jobs.

## Conventions

- Import shared shapes from `@torfun/types`; never redeclare them.
- API responses are snake_case (`company_name`, `full_name`) — that's the wire
  format. Renaming client-side means changing the API too.
- `NEXT_PUBLIC_*` is inlined at build time, so a runtime container env only reaches
  server components. Changing the API URL for a deployment needs a build arg.
- The auth pages use older snake_case identifiers and hand-written Tailwind; the
  ingestion side uses camelCase and shadcn. **Write new code in the ingestion
  style** and convert auth-side code when you touch it.
