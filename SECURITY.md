# Security

Security design, thresholds and verification for torfun. It describes what the code does today; it is not an
audit or an ASVS certification. Tracking: GitHub project "Torfun project", epic #172, sheet "Torfun OWASP ASVS".

## Reporting a vulnerability

Open a private security advisory on the repository, or email the maintainers. Please do not file public issues
for exploitable bugs.

## Threat model

Ranked STRIDE model with mitigations and ASVS 5.0 IDs: [`docs/threat-model.md`](docs/threat-model.md).
Mitigations are built in priority order (P1 first) and a P1 threat counts as verified only with a test or scan result.

## Controls and thresholds

All values live in code; this table is what to change together if one moves.

| Control                | Value                                                                                                                                            | Where                                                           |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------- |
| Password storage       | bcrypt, 12 rounds; never trimmed or truncated                                                                                                    | `services/auth.service.ts`                                      |
| Password policy        | 8-128 chars, no composition rules; common list, product words, username, known-breach lookup                                                     | `services/password-policy.ts`, `services/breached-passwords.ts` |
| Breach lookup          | HIBP range API, k-anonymity (5-char SHA-1 prefix only), 2 s timeout, **fails open** with a warning log                                           | `BREACHED_PASSWORD_CHECK`                                       |
| Login throttle         | 30 attempts / 15 min per IP; 10 / 15 min per account name (case-insensitive); 429 + `Retry-After`                                                | `plugins/security.ts`, `hooks/throttle-credentials.ts`          |
| Global API limit       | 100 requests / min per IP                                                                                                                        | `plugins/security.ts`                                           |
| Expensive routes       | ingestion Run 5 / 15 min; upstream read 30 / 15 min; source download 60 / min; TOR report 10 / 15 min                                            | `expensiveRouteLimit`                                           |
| Access token           | JWT HS256, 15 min, carries `sid` (session id)                                                                                                    | `plugins/jwt.ts`                                                |
| Refresh token          | 256-bit random, stored as SHA-256, rotated on every use, 7-day idle window                                                                       | `services/auth.service.ts`                                      |
| Absolute session limit | 30 days from sign-in, not extended by rotation                                                                                                   | `SESSION_ABSOLUTE_SECONDS`                                      |
| Session revocation     | logout, refresh-token reuse, account disable, role change and password change end the session **and** its access token immediately               | `hooks/require-auth.ts`                                         |
| Cookies                | httpOnly, `Secure` in production, SameSite=Lax; refresh cookie scoped to `/api/auth`                                                             | `routes/auth.ts`                                                |
| CSRF                   | Origin check on unsafe methods + SameSite + CORS allowlist                                                                                       | `plugins/origin-guard.ts`                                       |
| CORS                   | explicit origins from `CORS_ORIGINS`; a wildcard fails startup                                                                                   | `config/env.ts`, `plugins/security.ts`                          |
| Headers (API)          | helmet: CSP, HSTS, nosniff, frame protection, referrer policy, COOP                                                                              | `plugins/security.ts`                                           |
| Headers (web)          | CSP, HSTS, nosniff, frame deny, COOP/COEP                                                                                                        | `apps/web/next.config.ts`                                       |
| Errors                 | one handler; clients get `{ message }` only, never a stack                                                                                       | `core/errors.ts`                                                |
| Logging                | pino with credential redaction; audit events (`audit: true`) for sign-in, failures, lockout, password change, logout, admin account changes      | `core/audit.ts`, `core/log-redaction.ts`                        |
| Roles                  | self-registration is always `business_development_officer`; `admin` is granted by an administrator only; no self-targeting; last admin protected | `services/admin-users.service.ts`                               |
| Data scope             | company id comes from the stored user, never from the request                                                                                    | `services/company-scope.ts`                                     |

### Known limits

- The role claim in an access token is trusted for up to 15 minutes, but a role change revokes the session, so
  a demoted administrator's token stops working at once.
- A token minted before session tracking has no `sid` and is accepted until it expires (at most 15 minutes).
- Session lookup is one indexed query per authenticated request. Apply
  `docs/migrations/2026-11-refresh-token-session-indexes.js` before deploying.
- Web CSP: `script-src` still allows `'unsafe-inline'` (a nonce CSP would force fully dynamic rendering) and
  `object-src blob:` is open for the in-browser TOR PDF viewer. React text rendering and no `dangerouslySetInnerHTML`
  carry the XSS defense; the gap is pinned by `apps/web/src/lib/security-headers.test.ts` (#193).
- File-size, archive-entry and SSRF guards for ingestion are not yet implemented (#155, #151).

## Verification

```sh
bun install
cd apps/api && bun test src/security     # access control, CORS, headers, audit, rate limits, sessions
bun run lint && bun run typecheck
bun audit                                 # dependency advisories
```

| Test file                                   | Proves                                                                                                                                                                                                                 |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/security/access-control.test.ts`       | every non-public route returns 401 anonymously; every admin route returns 403 to an officer; forged, `alg=none` and expired JWTs are refused. It reads the live routing table, so new routes are covered automatically |
| `src/security/privilege-escalation.test.ts` | role in a registration body is ignored; no self-promotion; no self-demotion                                                                                                                                            |
| `src/security/cors-and-headers.test.ts`     | allowlisted origin echoed, unlisted gets no grant, `*` never returned, wildcard config rejected; API headers present; errors are a bare `{ message }`                                                                  |
| `src/security/audit-trail.test.ts`          | auth and admin events are logged; unknown-user and wrong-password failures look identical; no password, token or cookie reaches the log                                                                                |
| `src/security/rate-limits.test.ts`          | expensive routes answer 429 with `Retry-After` past their budget                                                                                                                                                       |
| `src/security/session-management.test.ts`   | 15 min access token; logout, reuse, disable and password change end sessions at once; absolute limit; password-change rules                                                                                            |
| `apps/web/src/lib/security-headers.test.ts` | web headers (CSP, HSTS, nosniff, frame deny, referrer, COOP, permissions) read from the real `next.config.ts`; no wildcard sources; the `unsafe-inline` gap is pinned                                                  |
| `src/services/breached-passwords.test.ts`   | only a 5-character hash prefix leaves the server; fails open when the service is down                                                                                                                                  |

CI (`.github/workflows/security.yml`): `bun audit` (PRs fail on new high advisories), gitleaks over history,
CodeQL (SAST), Trivy image scan and OWASP ZAP baseline (DAST) on pull requests to `main`.

## Principles

Least privilege, defense in depth, fail securely, complete mediation, economy of mechanism, separation of duties,
secure by default, open design, psychological acceptability. Where each lives in code is mapped in the
"Security principles" table of the project document and the sheet's _Principles_ tab.
