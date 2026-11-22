# Threat model

Torfun: software-procurement discovery and TOR matching. This is the design-phase
artefact for assignment criteria 2 and 16 (issues #180, #181). It ranks threats,
names the mitigation for each, and records whether the mitigation exists today.

Status values come from reading the code on `develop`, not from the plan. "Done"
means the control is in the code; it is not "verified" until the linked test or
scan evidence exists (#171).

## 1. System and trust boundaries

```
 Browser ──(B1)──▶ Next.js web ──(B2)──▶ Fastify API ──(B3)──▶ MongoDB Atlas
                                            │
                                            ├──(B4)──▶ Google OAuth / userinfo
                                            ├──(B5)──▶ Vertex AI (Gemini)
                                            ├──(B6)──▶ e-GP (gprocurement.go.th)
                                            └──(B7)──▶ LINE / email (notifications)
```

| Boundary | Crosses                       | Untrusted side                                |
| -------- | ----------------------------- | --------------------------------------------- |
| B1       | Internet to web               | Everything the user or an attacker sends      |
| B2       | Browser JS to API (CORS, JWT) | Cookies, headers, JSON bodies                 |
| B3       | API to database               | Query shape built from request data           |
| B4       | API to Google                 | Identity assertion                            |
| B5       | API to Vertex AI              | TOR PDFs and model output                     |
| B6       | API to e-GP                   | Feed XML, project pages, TOR archives (ZIP)   |
| B7       | API to LINE / email           | Recipient addresses, message content          |

Assets: user accounts and sessions, company profile/experience data (per-company
confidential), TOR corpus, admin functions (ingestion control, user management),
secrets (JWT secret, Google client secret, Mongo URI, service account key).

Actors: anonymous visitor; BD officer; admin; attacker holding a stolen cookie;
malicious or compromised upstream (agency document, e-GP response); authenticated
officer attacking another company.

## 2. Rating scale

Likelihood and impact are 1 (low) to 3 (high). Score = L x I.
**P1** = score 6 or 9, implement first. **P2** = 3 or 4. **P3** = 1 or 2.

## 3. Threats (STRIDE)

| ID   | STRIDE | Threat                                                                 | Entry point | L | I | Score | Pri | Mitigation (designed)                                                                   | ASVS 5.0                         | Status  | Issue      |
| ---- | ------ | ---------------------------------------------------------------------- | ----------- | - | - | ----- | --- | --------------------------------------------------------------------------------------- | -------------------------------- | ------- | ---------- |
| T-01 | S      | Credential stuffing / brute force on `/login`                           | B2          | 3 | 3 | 9     | P1  | Per-IP limit (30/15 min) and per-account throttle (10/15 min), uniform error             | V6.1.1, V6.3.1, V6.3.8, V2.4.1   | Partial | #167, #156 |
| T-02 | S      | Weak or breached passwords accepted at signup                           | B2          | 3 | 2 | 6     | P1  | Min length, common/breached-password screening, no composition rules                    | V6.2.1, V6.2.4, V6.2.12          | Not done (length 8 only) | #169, #156 |
| T-03 | S, E   | Stolen access or refresh token reused                                   | B1, B2      | 2 | 3 | 6     | P1  | httpOnly + secure cookies, 15 min access token, hashed rotating refresh token, revocation | V7.2.1, V7.4.1, V9.2.1, V3.3.1   | Partial | #170, #157 |
| T-04 | T, E   | CSRF on cookie-authenticated state changes                              | B2          | 2 | 3 | 6     | P1  | SameSite=Lax, CORS allowlist, Origin check on unsafe methods, JSON-only content type   | V3.5.1, V3.5.2, V3.5.3, V7.1.1   | Partial (no Origin check found) | #153, #157 |
| T-05 | E      | Officer reads or edits another company's clients/experiences            | B2, B3      | 2 | 3 | 6     | P1  | Company id read from stored user, never from request; negative tests per route          | V8.2.2, V8.3.1, V8.1.1           | Partial (design in `company-scope.ts`, tests missing) | #158 |
| T-06 | E      | Officer reaches admin endpoints or self-promotes to admin               | B2          | 2 | 3 | 6     | P1  | `requireAdmin` hook on every admin route; role never accepted from client; admin granted out of band | V8.2.1, V8.3.1, V6.3.2 | Partial | #158 |
| T-07 | T      | NoSQL/regex injection through search and filter parameters              | B2, B3      | 3 | 3 | 9     | P1  | Zod schemas on every input, typed queries, escape regex, bound lengths                   | V1.2.4, V1.2.9, V2.2.1, V1.3.12  | Partial (zod on auth; search escaping unverified) | #151, #152 |
| T-08 | T      | Stored XSS via agency text, TOR text or AI summary                      | B6, B5, B1  | 2 | 3 | 6     | P1  | React text rendering only, no `dangerouslySetInnerHTML`, CSP, safe URL protocols        | V1.2.1, V1.2.2, V3.2.2, V3.4.3   | Partial (CSP present, render audit missing) | #151, #153 |
| T-09 | D, T   | Malicious PDF/ZIP: zip bomb, huge archive, path traversal               | B6          | 2 | 3 | 6     | P1  | Size and entry-count caps, no extraction to disk by name, timeouts, memory bound         | V5.2.1, V5.2.2, V5.3.2, V1.4.2   | Partial (concurrency bounded; size caps not found) | #155 |
| T-10 | S, I   | SSRF or redirect abuse when fetching upstream URLs                      | B6          | 2 | 3 | 6     | P1  | Fixed hosts from constants, allowlist, revalidate redirects, block private ranges       | V1.3.6, V12.3.2, V15.2.5         | Partial (URLs built from constants; no explicit guard) | #151 |
| T-11 | I      | Secrets or personal data in logs, errors or API responses               | B2          | 2 | 3 | 6     | P1  | pino redaction of cookies/authorization/password, no stack traces to client, minimal user DTO | V16.2.5, V16.5.1, V14.1.1, V13.3.1 | Partial (URL redaction in e-GP client only) | #166, #164 |
| T-12 | I      | Secrets committed to the repository or baked into images                | Repo        | 2 | 3 | 6     | P1  | zod-validated env, `.env` gitignored, gitleaks in CI, Trivy                              | V13.3.1, V13.2.1                 | Done    | #163       |
| T-13 | D      | API flooding / expensive endpoints                                      | B2          | 3 | 2 | 6     | P1  | Global 100 req/min per IP, tighter limits on expensive routes, body size limit          | V4.1.1, V2.4.1, V15.2.2          | Partial (global limit only) | #168       |
| T-14 | S      | Google sign-in misuse: unverified email, account linking takeover       | B4          | 2 | 3 | 6     | P1  | Identity read from authenticated userinfo, require verified email, link by Google `sub`  | V10.4.1, V10.5.2, V6.8.1         | Partial | #160       |
| T-15 | T      | Prompt injection through TOR text steers classification or output       | B5          | 3 | 2 | 6     | P1  | Treat model output as untrusted, schema-validate it, never execute it, no tools         | V1.3.2, V1.3.5, V2.1.1           | Partial (schema-validated output) | #151, #165 |
| T-16 | R      | No audit trail for auth and admin actions                               | B2          | 2 | 2 | 4     | P2  | Structured events for login, failure, lockout, role change, admin actions               | V16.3.1, V16.3.2, V16.4.1        | Not done | #166       |
| T-17 | I      | Weak transport or headers on the deployed site                          | B1          | 1 | 3 | 3     | P2  | HSTS, CSP, nosniff, frame-deny on web (set) and API (helmet); TLS only in production   | V12.1.1, V3.4.1, V3.4.3, V3.4.4  | Done (deployed check pending) | #153, #162, #171 |
| T-18 | I      | Verbose errors reveal internals or user existence                        | B2          | 2 | 2 | 4     | P2  | Central error handler returns `{message}` only; uniform login failure                    | V16.5.1, V6.3.8                  | Partial | #166       |
| T-19 | T      | Vulnerable dependency or container base image                           | CI          | 2 | 2 | 4     | P2  | `bun audit`, Trivy, weekly schedule, pinned action SHAs                                  | V15.2.1, V15.1.1                 | Done    | #165       |
| T-20 | I      | Email/LINE notification abuse: header injection, unwanted recipients    | B7          | 1 | 2 | 2     | P3  | Validate recipient fields, strip CR/LF, send only to verified owner contact              | V1.3.11, V2.2.1                  | Not done | #151       |

## 4. Implementation order

1. P1 with score 9: T-01, T-07. Then the rest of P1, grouped by shared fix: sessions and CSRF (T-03, T-04), isolation (T-05, T-06), ingestion input (T-09, T-10, T-15), leakage (T-11), account quality (T-02), rate limits (T-13), SSO (T-14).
2. P2: audit trail (T-16), deployed header check (T-17), error shape (T-18), dependency hygiene (T-19).
3. P3: notification hygiene (T-20).

Every P1 threat needs a negative test or scan result linked in #171 before it
counts as verified.

## 5. Out of scope and accepted

- MongoDB Atlas, Google OAuth and Vertex AI internals: provider-owned.
- Physical and client-device compromise.
- Denial of service at network level: left to the hosting platform.
- e-GP `robots.txt` and authorisation limits are an operating constraint, not a security control; see `AGENTS.md`.
