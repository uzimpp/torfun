#!/usr/bin/env python3
"""Builds docs/security/sheet-sync.gs from docs/threat-model.md and the status tables below.

Run: python3 docs/security/build-sheet-sync.py
The .gs file is pasted into Extensions > Apps Script of the ASVS sheet and run once
(menu "Torfun sync" > "Sync security tracking"). Edit STATUS and the tables here, rebuild, repaste.
"""
import json, re, pathlib

ROOT = pathlib.Path(__file__).resolve().parents[2]
REPO = "https://github.com/uzimpp/torfun"

# --- ASVS row statuses: only what the code or a PR proves. Everything else defaults. ---
# status vocabulary: Not started | Partial | In review | Done | Verified | Not applicable
STATUS = {
    "V3.5.1": ("In review", "PR #187: Origin guard on unsafe methods (T-04)"),
    "V3.5.2": ("In review", "PR #187: Origin guard + CORS allowlist (T-04)"),
    "V16.2.5": ("In review", "PR #187: pino redaction of cookies, auth, passwords, tokens (T-11)"),
    "V6.2.1": ("In review", "PR #188: 8-char minimum enforced in password-policy.ts"),
    "V6.2.4": ("In review", "PR #188: 2087 common passwords refused (SecLists 10k, policy-compatible)"),
    "V6.2.5": ("In review", "PR #188: no composition rules"),
    "V6.2.11": ("In review", "PR #188: context words (torfun, procurement...) and username refused"),
    "V6.3.1": ("Partial", "authIpRateLimit 30/15min + per-account throttle 10/15min; routes/auth.test.ts. Docs pending (#167)"),
    "V6.3.8": ("Partial", "Login error is uniform; registration still returns 409 for a taken username"),
}

# --- threat table parsed from docs/threat-model.md ---
def parse_threats():
    rows = []
    for line in (ROOT / "docs/threat-model.md").read_text().splitlines():
        if re.match(r"\| T-\d+", line):
            c = [x.strip() for x in line.strip().strip("|").split("|")]
            rows.append(c)
    return rows

threats = parse_threats()
asvs_to_threat = {}
for c in threats:
    for m in re.findall(r"V\d+\.\d+\.\d+", c[9]):
        asvs_to_threat.setdefault(m, []).append(c[0])

TOP10 = [
 ["A01:2021 Broken Access Control","V8, V3.5","requireAuth/requireAdmin hooks; company id read from the stored user, never the request","Partial","#158","T-05, T-06","Negative tests for cross-company and admin routes are missing"],
 ["A02:2021 Cryptographic Failures","V11, V12, V13.3","bcrypt password hashes; hashed refresh tokens; HSTS on web; secrets only from env; gitleaks in CI","Partial","#161, #162, #163","T-12, T-17","Deployed TLS check and bcrypt 72-byte limit not yet reviewed"],
 ["A03:2021 Injection","V1, V2","Zod validation on inputs; typed MongoDB queries; React text rendering","Partial","#151, #152","T-07, T-08, T-20","Regex escaping and length bounds on search not yet verified"],
 ["A04:2021 Insecure Design","V15, V2","Threat model with ranked threats; layered controls","In review","#165, #180","T-01..T-20","PR #186"],
 ["A05:2021 Security Misconfiguration","V13, V3.4, V12","helmet on API; CSP, HSTS, nosniff, frame-deny on web; zod-validated env; CORS allowlist","Partial","#153, #163","T-17","Deployed header screenshot pending (#171)"],
 ["A06:2021 Vulnerable and Outdated Components","V15.2","bun audit (PR and weekly), Trivy image scan, pinned action SHAs","Done","#165","T-19","Evidence: .github/workflows/security.yml"],
 ["A07:2021 Identification and Authentication Failures","V6, V7, V9, V10","Login throttling; 15-minute JWT; rotating refresh tokens; password screening (PR #188); Google OAuth","Partial","#156, #157, #159, #160, #167-170","T-01, T-02, T-03, T-14","Breached-password lookup, password change, session docs open"],
 ["A08:2021 Software and Data Integrity Failures","V15, V1.5","Frozen lockfile in CI; pinned action SHAs; model output validated by schema","Partial","#165, #151","T-15, T-19","XML/deserialization settings for the RSS feed not yet reviewed"],
 ["A09:2021 Security Logging and Monitoring Failures","V16","pino structured logs; redaction (PR #187); central error handler","Partial","#166","T-11, T-16","No audit trail for auth and admin events yet"],
 ["A10:2021 Server-Side Request Forgery","V1.3.6, V13.2.4","Upstream URLs come from constants, not user input","Partial","#151","T-10","No explicit allowlist or redirect revalidation yet"],
]

PRINCIPLES = [
 ["Least privilege","Self-registration always creates a BD officer; admin is granted out of band; company id comes from the stored user","apps/api/src/hooks/require-admin.ts, services/company-scope.ts","In code","Per-route negative tests (#158)"],
 ["Defense in depth","Per-IP and per-account login throttles; SameSite cookies plus Origin guard plus CORS allowlist; CSP plus React text rendering","plugins/security.ts, hooks/throttle-credentials.ts, plugins/origin-guard.ts","In code","SSRF and archive limits (#151, #155)"],
 ["Fail securely","Env validation aborts startup; refresh failure clears both cookies; errors return a generic message","config/env.ts, routes/auth.ts, core/errors.ts","In code","Verify no stack traces reach clients (#166)"],
 ["Complete mediation","Every protected route runs requireAuth; role and company are re-read per request instead of trusted from the token","hooks/require-auth.ts, services/company-scope.ts","Partial","Audit that no route skips the hook (#158)"],
 ["Economy of mechanism","One composition root, one error handler, one rate-limit plugin","app.ts, core/errors.ts","In code",""],
 ["Separation of duties","Admin accounts are not created by self-service; admin password reset by initiation only is planned","routes/admin.ts","Partial","V6.4.6 not implemented (#156)"],
 ["Secure by default","Cookies httpOnly, secure in production, SameSite=Lax; CORS defaults to localhost only","routes/auth.ts, config/env.ts","In code",""],
 ["Open design","Security plan, threat model and ASVS mapping are in the repository","docs/threat-model.md, SECURITY.md (#132)","Partial","SECURITY.md not written yet"],
 ["Psychological acceptability","Passphrases and paste allowed; no composition rules; uniform login message","services/password-policy.ts","In review","PR #188"],
]

RUBRIC = [
 [1,"List of ASVS requirements","Requirement","Done","#172","This sheet: 345 rows, 227 planned"],
 [2,"Threat model with priorities","Design","In review","#180","PR #186, docs/threat-model.md"],
 [3,"Security design principles","Design","In review","#182","Principles tab (draft)"],
 [4,"Password authentication","Implementation","Partial","#156","bcrypt, login, password policy (PR #188); no password change yet"],
 [5,"Social SSO (OAuth/OIDC)","Implementation","Partial","#160","Google OAuth in routes/auth.ts; verification tests pending"],
 [6,"Authorization (roles)","Implementation","Partial","#158","requireAdmin, officer default role; tests pending"],
 [7,"Access control (own data only)","Implementation","Partial","#158","company-scope.ts; negative tests pending"],
 [8,"Input validation and injection","Implementation","Partial","#151, #152","Zod schemas; search escaping to verify"],
 [9,"Environment variables and credentials","Implementation","Partial","#163","Zod env, .env.example, gitleaks; docs pending"],
 [10,"CORS (no wildcard)","Implementation","Partial","#154","Allowlist from CORS_ORIGINS; unlisted-origin test pending (#171)"],
 [11,"Error handling","Implementation","Partial","#166","Central handler in core/errors.ts"],
 [12,"Logging","Implementation","Partial","#166","pino + redaction (PR #187); audit events missing"],
 [13,"HTTP security headers","Implementation","Partial","#153","next.config.ts + helmet; devtools screenshot pending (#171)"],
 [14,"SAST report","Testing","Partial","#171","CodeQL job in security.yml; export report"],
 [15,"DAST report","Testing","Partial","#171","ZAP baseline job in security.yml; export report"],
 [16,"Threat to implementation checklist","Testing","In review","#181","Status column in docs/threat-model.md"],
 [17,"Map to ASVS and OWASP Top 10","Testing","In review","#183","OWASP Top 10 tab (draft)"],
 [18,"4 advanced features","Implementation","Partial","#167, #168, #169, #170","Login limits, API rate limit, password screening, JWT expiry: each partly done"],
]

data = {
 "repo": REPO,
 "status": {k: {"s": v[0], "e": v[1]} for k, v in STATUS.items()},
 "asvsThreats": {k: ", ".join(v) for k, v in asvs_to_threat.items()},
 "threats": [["ID","STRIDE","Threat","Entry","Likelihood","Impact","Score","Priority","Mitigation","ASVS 5.0","Status","Issue"]] +
            [[c[0],c[1],c[2],c[3],int(c[4]),int(c[5]),int(c[6]),c[7],c[8],c[9],c[10],c[11]] for c in threats],
 "top10": [["OWASP Top 10","ASVS chapters","Torfun control","Status","Issues","Threats","Gap"]] + TOP10,
 "principles": [["Principle","How torfun applies it","Where","Status","Gap"]] + PRINCIPLES,
 "rubric": [["#","Grading criterion","Phase","Status","Issues","Evidence"]] + RUBRIC,
}

GS = r"""/**
 * Torfun security tracking sync. Generated by docs/security/build-sheet-sync.py - do not edit here.
 * Paste into Extensions > Apps Script of the ASVS sheet, save, run syncSecurityTracking() once.
 * Safe to re-run: it overwrites script-owned cells only.
 */
const DATA = __DATA__;
const ASVS_SHEET = 'ASVS Requirements';
const STATUSES = ['Not started', 'Partial', 'In review', 'Done', 'Verified', 'Not applicable'];
const COLORS = {'Not started': '#f4cccc', 'Partial': '#fff2cc', 'In review': '#cfe2f3', 'Done': '#d9ead3', 'Verified': '#b6d7a8', 'Not applicable': '#eeeeee', 'Not done': '#f4cccc', 'Done': '#d9ead3', 'In code': '#d9ead3'};

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Torfun sync').addItem('Sync security tracking', 'syncSecurityTracking').addToUi();
}

function syncSecurityTracking() {
  const ss = SpreadsheetApp.getActive();
  syncAsvs_(ss);
  writeTab_(ss, 'Threat model', DATA.threats, [60, 70, 320, 70, 70, 60, 60, 60, 380, 200, 180, 110], 'K');
  writeTab_(ss, 'OWASP Top 10', DATA.top10, [260, 130, 420, 100, 160, 130, 360], 'D');
  writeTab_(ss, 'Principles', DATA.principles, [200, 420, 340, 100, 280], 'D');
  writeTab_(ss, 'Assignment rubric', DATA.rubric, [40, 280, 110, 100, 160, 420], 'D');
  SpreadsheetApp.getUi().alert('Torfun security tracking synced.');
}

function syncAsvs_(ss) {
  const sh = ss.getSheetByName(ASVS_SHEET);
  if (!sh) throw new Error('Sheet "' + ASVS_SHEET + '" not found');
  const lastRow = sh.getLastRow();
  const head = sh.getRange(1, 1, Math.min(5, lastRow), sh.getLastColumn()).getValues();
  let hr = -1;
  for (let r = 0; r < head.length; r++) if (head[r][1] === 'Requirement ID') { hr = r + 1; break; }
  if (hr < 0) throw new Error('Header row with "Requirement ID" not found');
  const names = ['Status', 'Issue', 'Evidence', 'Threats', 'Updated'];
  let headers = sh.getRange(hr, 1, 1, sh.getLastColumn()).getValues()[0];
  const col = {};
  names.forEach(n => {
    let i = headers.indexOf(n);
    if (i < 0) { i = headers.length; headers.push(n); sh.getRange(hr, i + 1).setValue(n); }
    col[n] = i + 1;
  });
  sh.getRange(hr, col['Status'], 1, 5).setFontWeight('bold').setBackground('#d9d9d9');
  const n = lastRow - hr;
  if (n <= 0) return;
  const ids = sh.getRange(hr + 1, 2, n, 1).getValues();
  const decisions = sh.getRange(hr + 1, 5, n, 1).getValues();
  const cur = sh.getRange(hr + 1, col['Status'], n, 1).getValues();
  const evCur = sh.getRange(hr + 1, col['Evidence'], n, 1).getValues();
  const updCur = sh.getRange(hr + 1, col['Updated'], n, 1).getValues();
  const today = Utilities.formatDate(new Date(), 'Etc/UTC', 'yyyy-MM-dd');
  const out = { status: [], issue: [], ev: [], thr: [], upd: [] };
  for (let i = 0; i < n; i++) {
    const id = String(ids[i][0]);
    const m = /^V(\d+)\./.exec(id);
    const ov = DATA.status[id];
    let st = cur[i][0], ev = evCur[i][0];
    if (ov) { st = ov.s; ev = ov.e; }
    else if (!st) st = String(decisions[i][0]) === 'Not applicable' ? 'Not applicable' : 'Not started';
    out.status.push([st]);
    out.ev.push([ev]);
    out.issue.push([m ? '=HYPERLINK("' + DATA.repo + '/issues/' + (150 + Number(m[1])) + '","#' + (150 + Number(m[1])) + '")' : '']);
    out.thr.push([DATA.asvsThreats[id] || '']);
    out.upd.push([ov ? today : updCur[i][0]]);
  }
  const put = (name, key) => sh.getRange(hr + 1, col[name], n, 1).setValues(out[key]);
  put('Status', 'status'); put('Evidence', 'ev'); put('Threats', 'thr');
  sh.getRange(hr + 1, col['Issue'], n, 1).setFormulas(out.issue);
  sh.getRange(hr + 1, col['Updated'], n, 1).setValues(out.upd);
  const rng = sh.getRange(hr + 1, col['Status'], n, 1);
  rng.setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(STATUSES, true).setAllowInvalid(false).build());
  applyColors_(sh, rng);
  sh.setColumnWidth(col['Status'], 110); sh.setColumnWidth(col['Issue'], 60);
  sh.setColumnWidth(col['Evidence'], 360); sh.setColumnWidth(col['Threats'], 120);
}

function applyColors_(sh, rng) {
  const rules = sh.getConditionalFormatRules().filter(r => {
    const rs = r.getRanges();
    return !(rs.length === 1 && rs[0].getColumn() === rng.getColumn() && rs[0].getSheet().getName() === sh.getName());
  });
  Object.keys(COLORS).forEach(k => rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenTextStartsWith(k).setBackground(COLORS[k]).setRanges([rng]).build()));
  sh.setConditionalFormatRules(rules);
}

function writeTab_(ss, name, rows, widths, statusCol) {
  let sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  sh.clear();
  sh.getRange(1, 1, rows.length, rows[0].length).setValues(rows).setVerticalAlignment('top').setWrap(true);
  sh.getRange(1, 1, 1, rows[0].length).setFontWeight('bold').setBackground('#d9d9d9');
  sh.setFrozenRows(1);
  widths.forEach((w, i) => sh.setColumnWidth(i + 1, w));
  if (statusCol) {
    const c = sh.getRange(statusCol + '1').getColumn();
    applyColors_(sh, sh.getRange(2, c, rows.length - 1, 1));
  }
}
"""
out = ROOT / "docs/security/sheet-sync.gs"
out.write_text(GS.replace("__DATA__", json.dumps(data, ensure_ascii=False, indent=1)))
print("wrote", out, len(out.read_text()), "bytes;", len(threats), "threats;", len(asvs_to_threat), "asvs->threat links")
