# Torfun Security Report

Course 01219325 Software Development Security. This report covers grading rubrics 1, 2, 3, 14, 15, 16, 17 and 18. Rubrics 4 to 13 are implemented in code, and the evidence for each is listed in section 6.

Status marks: **Done** is implemented and has a test or CI check. **Partial** is implemented with a stated gap. **Not done** is a known gap.

## 1. ASVS requirements followed (rubric 1)

Target: ASVS Level 1 in full where it applies, and selected Level 2 items.

| ASVS chapter | Requirement followed | Level |
|---|---|---|
| V2 Authentication | Passwords of 8 to 128 characters, stored as bcrypt hashes; throttling of repeated login attempts | L1 |
| V2 Authentication | Social sign-in with Google OAuth, using PKCE (S256) | L1 |
| V3 Session management | Access token in a `httpOnly`, `sameSite=lax` cookie, `secure` outside local development; 15-minute access token; refresh tokens stored as SHA-256 digests, rotated, and revoked when reuse is seen | L1, L2 |
| V4 Access control | Role check on every admin route; per-company data scoping; deny by default through `require-auth` and `require-admin` hooks | L1 |
| V5 Validation | Request bodies parsed with zod schemas before use | L1 |
| V7 Errors and logging | Central error handling (`core/errors.ts`); structured request logs | L1 |
| V8 Data protection | `Cache-Control: no-store` on API responses by default | L2 |
| V10 Malicious code and V14 Configuration | Environment validated at startup; secrets read from environment; CI runs dependency audit, secret scan, CodeQL, container scan | L1 |
| V13 API | CORS restricted to an allowlist; global and per-endpoint rate limits | L1 |
| V14 Configuration | Helmet headers with a CSP (`default-src 'self'`, `object-src 'none'`, `frame-ancestors 'none'`) | L1 |

## 2. Threat model (rubric 2)

Method: STRIDE over the main flows (login and SSO, session refresh, company data access, admin actions, document ingestion). Priority: **P1** is implemented first, **P2** next, **P3** if time allows.

| # | Threat (STRIDE) | Priority | Mitigation | Status |
|---|---|---|---|---|
| T1 | Brute-force or credential stuffing on login (S) | P1 | Per-IP limit of 30 per 15 minutes; per-account throttle of 10 per 15 minutes | Done |
| T2 | Reading or changing another company's data (E, I) | P1 | Company scoping in repositories; route tests such as "private suggestions never leak another company customers" | Done |
| T3 | Normal user calling admin endpoints (E) | P1 | `require-admin` hook checks the `admin` role; `admin.test.ts` | Done |
| T4 | Stolen refresh token reused (S) | P1 | Digest-only storage, rotation, revoke on reuse | Done |
| T5 | NoSQL or operator injection through request bodies (T) | P1 | zod validation before queries | Done (no live injection test; see section 5) |
| T6 | Cross-site request from another origin (S, I) | P1 | CORS allowlist, `sameSite=lax` cookies | Done |
| T7 | Secrets leaking through git (I) | P1 | `.env` ignored, `.env.example` only, gitleaks in CI | Done (history scan runs in CI only) |
| T8 | Vulnerable dependencies (T, E) | P1 | `bun audit` in CI; `bun audit fix` applied in this review | Partial (4 findings remain, section 4) |
| T9 | Abuse or denial of service through heavy endpoints or large archives (D) | P2 | Global limit of 100 per minute; ingestion soak test for memory growth | Partial (no load test run yet) |
| T10 | Clickjacking or script injection in the web app (T) | P2 | CSP with `frame-ancestors 'none'`; note the web CSP allows inline scripts (ZAP rule 10055, documented in `.zap/rules.tsv`) | Partial |
| T11 | Sensitive data left in logs or error bodies (I) | P2 | Central error handler | Not verified (no log redaction review done) |
| T12 | Account takeover without a second factor (S) | P3 | Not implemented (no MFA) | Not done |
| T13 | Use of breached passwords at sign-up (S) | P3 | Not implemented | Not done |

## 3. Security design principles (rubric 3)

| Principle | Where it shows in the code |
|---|---|
| Least privilege | Admin routes behind a separate hook; users see only their company's records |
| Defence in depth | IP limit and per-account throttle together; helmet, CORS and cookie flags together |
| Fail secure, deny by default | `require-auth` hook on routes; unknown origins rejected by CORS |
| Complete mediation | Role and company checks on each request, not once per session |
| Secure defaults | `no-store` caching and `secure` cookies unless running locally |
| Don't trust input | zod parsing at the route edge |
| Separation of duties | Roles `admin` and normal user in `packages/types/src/user.ts` |
| Keep secrets out of code | Environment validated on start; startup fails if values are missing |

## 4. SAST, DAST and dependency results (rubrics 14 and 15)

Tools are configured in `.github/workflows/security.yml`: CodeQL (SAST), ZAP baseline with `.zap/rules.tsv` (DAST), Trivy (containers), gitleaks (secrets), `bun audit` (dependencies).

The CodeQL and ZAP reports are produced by CI, so **attach the latest workflow run reports to the submission**. They were not regenerated for this review.

Dependency audit run locally on 2026-11-23 against `develop`:

| | Before | After `bun audit fix` |
|---|---|---|
| Total | 19 (1 high, 14 moderate, 4 low) | 4 (1 high, 3 moderate) |

`bun audit fix` fixed 15 vulnerabilities in 8 packages, and only `bun.lock` changed. Next.js was already at 16.4.6 on `develop`, so the earlier critical Next.js advisories (remote code execution, versions up to 16.4.0) do not apply to this branch.

Remaining findings: `zod` below 4.6.6 (high; the fix needs the 3 to 4 major upgrade), `minimatch` (moderate), and two `@vitest/mocker` advisories (moderate, development only). Decision: accepted for now and tracked.

After the change, typecheck and lint pass. The API suite ran 1107 tests with 1 failure: a test that needs a live MongoDB on `localhost:27017`, which the review machine did not have. It is not related to the lockfile change.

## 5. Security tests run

| Test | Result |
|---|---|
| API unit and route tests, including auth, rate limit (429), admin and cross-company access | 1107 run, 1 fail (needs MongoDB, not available on the review machine) |
| Dependency audit | Section 4 |
| Ingestion soak test (50 archives, memory must end near where it began) | Part of the suite; passes |

**Not run yet:** a live pen test and a load test against a running API. They need MongoDB and a filled `apps/api/.env`, which this review environment did not have. Suggested checks to run before presenting: login brute force to confirm a 429, a request with `{"$ne": null}` in a login body to confirm a 400, a normal user token on an admin route to confirm a 403, a second company's ID on a company route to confirm a 404 or 403, and a load test of the main read endpoints.

## 6. Rubric checklist (rubrics 16, 17 and 18)

| # | Rubric | Status | Evidence |
|---|---|---|---|
| 1 | ASVS list | Done | Section 1 |
| 2 | Threat model with priorities | Done | Section 2 |
| 3 | Design principles | Done | Section 3 |
| 4 | Password authentication | Done | `services/auth.service.ts` (bcrypt), `routes/auth.ts` |
| 5 | Social SSO | Done | `plugins/google-oauth.ts` (PKCE S256) |
| 6 | Authorization | Done | `hooks/require-admin.ts`, `UserRole` |
| 7 | Access control | Done | Route tests for company scoping |
| 8 | Input validation, injection | Partial | zod schemas; no live injection test |
| 9 | Environment and credentials | Done | `.env.example`, startup validation (`config/env.ts`), gitleaks in CI |
| 10 | CORS | Done | `plugins/security.ts` (allowlist from `CORS_ORIGINS`) |
| 11 | Error handling | Done | `core/errors.ts` |
| 12 | Logging | Partial | Request logs exist; auth events and redaction not reviewed |
| 13 | HTTP security headers | Done | Helmet in `plugins/security.ts`; show during the demo or capture from devtools |
| 14 | SAST | Done | CodeQL in CI; attach report |
| 15 | DAST | Done | ZAP baseline in CI; attach report |
| 16 | Threat model checklist | Done | Section 2 status column |
| 17 | Map to ASVS and Top 10 | Done | Section 1; Top 10 mapping below |
| 18 | Four advanced features | Done | Below |

**Rubric 18, the four features chosen:**
1. Rate limit for login attempts (per-IP and per-account).
2. Rate limit for backend APIs (global 100 per minute).
3. JWT expiration management (15-minute access token, refresh rotation and revocation).
4. Login timeout (the access cookie expires with its token).

**OWASP Top 10 (2021) mapping:** A01 Broken Access Control → T2, T3. A02 Cryptographic Failures → bcrypt, digest-only refresh tokens, `secure` cookies. A03 Injection → T5. A04 Insecure Design → this threat model. A05 Security Misconfiguration → helmet, CORS, startup env validation. A06 Vulnerable Components → T8. A07 Identification and Authentication Failures → T1, T4. A08 Software and Data Integrity → pinned CI actions, frozen lockfile. A09 Logging and Monitoring Failures → T11 (partial). A10 SSRF → not assessed.
