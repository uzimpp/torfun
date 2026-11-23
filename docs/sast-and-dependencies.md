# SAST and dependency scan results

Captured 2026-11-17 from GitHub code scanning and `bun audit`. Issues #190, #165.

## CodeQL (javascript-typescript, 87 rules)

Runs on every pull request and on `main` (`.github/workflows/security.yml`, job `sast`).

| Ref                                            | Analysed   | Results | Notes                                                       |
| ---------------------------------------------- | ---------- | ------- | ----------------------------------------------------------- |
| `main`                                         | 2026-11-16 | 0       |                                                             |
| PR #194 (verification, sessions, breach check) | 2026-11-16 | 2       | Both `js/insufficient-password-hash`, dismissed (see below) |
| PR #195 (dependency fixes)                     | 2026-11-16 | 0       |                                                             |
| PR #196 (SSRF, archive limits, search)         | 2026-11-16 | 0       |                                                             |
| PR #197 (Google sign-in)                       | 2026-11-16 | 0       |                                                             |

Triage of the two results:

| Alert | Location                                           | Decision       | Reason                                                                                                                                                                                                          |
| ----- | -------------------------------------------------- | -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| #292  | `apps/api/src/services/breached-passwords.ts`      | False positive | SHA-1 is the Have I Been Pwned range-API protocol: only the first 5 hex characters leave the server and the match is local. It never stores or verifies a password; stored passwords use bcrypt with 12 rounds. |
| #293  | `apps/api/src/services/breached-passwords.test.ts` | Used in tests  | The test double for the same API computes the same SHA-1.                                                                                                                                                       |

## Trivy (container images, HIGH and CRITICAL)

Runs on pull requests to `main`, on PRs labelled `dast` (#198), and weekly. On the `main` images: 291 alerts raised over time, 275 fixed, 16 open (5 critical, 3 high, 8 medium). The open ones are the web image's `next` 16.3.1 and `sharp` 0.35.3 on `main`. `develop` is already past the fixed `sharp` 0.35.4 (0.35.5); PR #195 moves `next` to 16.4.6, past every fixed version listed.

## bun audit (lockfile)

PRs fail only on advisories they introduce; the weekly run audits everything.

| Tree                                    | Total | Critical | High | Moderate | Low |
| --------------------------------------- | ----- | -------- | ---- | -------- | --- |
| `develop` on 2026-11-17                 | 40    | 2        | 10   | 23       | 5   |
| PR #195 (next 16.4.6 + override floors) | 19    | 0        | 1    | 14       | 4   |

Critical findings before the fix: GHSA-2464-fhr4-w9xw (unauthenticated RCE in the Next.js image optimisation API with SVG) and GHSA-673q-mjm6-r5xr (RCE in `use cache` functions), both fixed in Next.js 16.4.1.

Accepted risk: `zod` < 4.6.6, GHSA-mrhx-c7xc-m3w5 (memory exhaustion while validating oversized constrained collections). Every 3.x release is affected and v4 is a major migration across every schema. Fastify's default 1 MiB request body limit bounds the collection size a client can send. Tracked in #165 for after submission.
