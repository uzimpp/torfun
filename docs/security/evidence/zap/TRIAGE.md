# OWASP ZAP baseline: results and triage

Run: GitHub Actions run 43964288258 on PR #198 (2026-11-16), `zap-baseline.py -a` against an ephemeral
`docker compose` stack (web on :3000, API on :8080). Reports: `zap-web-report.html|md`, `zap-api-report.html|md`.
Assignment criterion 15; issue #191.

| Target | FAIL | WARN | IGNORE (pre-triaged) | PASS |
| --- | --- | --- | --- | --- |
| Web, http://localhost:3000 | 0 | 1 | 4 | 66 |
| API, http://localhost:8080/api/health | 0 | 0 | 2 | 69 |

No High or Medium-risk issue was found that is not already a known, documented decision.

## Findings

| Rule | Risk | Where | Decision |
| --- | --- | --- | --- |
| 10031 User Controllable HTML Element Attribute (Potential XSS) | Informational | `/search` filter params (`deadlineFrom`, `deptName`, `industry`, `status`, ...) | **False positive.** The values are reflected only into `<input value>` (5) and `<input max>` (4). React escapes attribute values; none reaches `href`, `src`, `style` or an event handler. The one `dangerouslySetInnerHTML` in the web app (`components/ui/chart.tsx`) renders static, developer-written colour config. Added to `.zap/rules.tsv` with this reason. |
| 10055 CSP: script-src `unsafe-inline` | Medium | every page | **Known gap, accepted.** A nonce CSP would force fully dynamic rendering (see `apps/web/src/lib/csp.ts`). Pinned by `apps/web/src/lib/security-headers.test.ts`; listed in SECURITY.md. React text rendering carries the XSS defence. |
| 10055 CSP: style-src `unsafe-inline` | Medium | every page | Same decision: Tailwind and Next inject styles inline. Style injection cannot run script. |
| 10094 Base64 Disclosure | Informational | minified bundles | False positive (base64-looking strings in JS/CSS), pre-triaged. |
| 10049 Storable / Non-storable content | Informational | static chunks, pages | Expected for static chunks. Separately, API responses now default to `Cache-Control: no-store` (PR #194, ASVS V14.3.2); before that only company-qualification and match responses set it. |
| 90005 Sec-Fetch-* header missing | Informational | all | ZAP's spider does not send Fetch Metadata request headers; not an application issue. |

## What passed (selected, relevant to the threat model)

Cookie HttpOnly / Secure / SameSite, anti-clickjacking header, X-Content-Type-Options, CSP present, HSTS,
no debug error messages, no sensitive information in URLs, no server version leak, no vulnerable JS library
(Retire.js), no off-site redirect, no cross-domain script inclusion.
