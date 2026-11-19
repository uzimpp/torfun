# Bid strategy, Phase 0: GovSpending API findings

Date: 2026-11-20. Scope of evidence: **about 12 API calls**, fiscal year 2569 only, 5-6 hand-picked projects
(mostly software-like, plus one large construction project). Everything below says exactly how much it rests on.
Samples are in `samples/` and are sanitized (no API key, no `request` echo, no coordinates, TINs masked).

Tags: **[Verified]** seen in live data (sample size stated) · **[Spec]** documented, not seen live · **[Assumption]** · **[Open]**.

## 0. Security finding
- **[Verified]** Every response echoes the request parameters in a `request` object, **including the `api-key` in plain text**.
  Never log, store or return a raw response. Strip `request` at the client boundary. Never commit raw responses.
- A key was shown once in this working session's output; consider rotating it at https://opend.data.go.th/register_api.

## 1. Endpoints and limits
- **[Verified]** Envelope: `{success, code, message, required, total, data}`. `total` is the count of all matches, not the page size.
- **[Verified]** Rate limit headers: `x-ratelimit-limit-day: 1000` and `x-ratelimit-remaining-day` (decrements by 1 per call). Behaviour at zero (429 vs other) **[Open]**, untested on purpose.
- **[Verified]** `egp-contract` also accepts `year` + `limit` up to 200 (a 200-row page was 384 KB); larger limits not tried.

## 2. Filters on `egp-contract` (tested one call each)
| Filter | Result |
|---|---|
| `dept_code` | **[Verified]** `S505` returned 2407 rows, all "การไฟฟ้านครหลวง" (first 5 inspected). Codes come from `egp-dept` (name search, substring: "การไฟฟ้านครหลวง" returned 3 agencies) |
| `winner_tin` | **[Verified]** returned 1 row whose contract has that TIN |
| `keyword` | **[Verified]** matches the project name as a substring, and returns non-software too (equipment purchases, construction for "พัฒนาระบบ"). It cannot classify software |
| `budget_start/budget_end` | **[Verified, important]** filters on the **agreed price (`sum_price_agree`)**, not `project_money`. With `budget_end=3000000`, all 20 rows had `sum_price_agree` <= 3,000,000 while several had `project_money` above it (6,000,000; 4,500,000; 3,750,000; 3,531,000). The doc says "วงเงินงบประมาณ" (budget), which is misleading. Lower bound tested only together with the upper bound |
| `limit`/`offset` | `limit` works up to 200; `offset` **[Open]** (not tested) |
- **[Verified]** Rows came back ordered by `sum_price_agree` descending when a budget range was given; ordering is undocumented, do not rely on it.
- **[Verified]** `egp-contract` rows carry `dept_name` only, not `dept_code`. Mapping name to code needs `egp-dept` (name collisions **[Open]**).
- **[Verified]** `egp-contract-submit` takes `project_id` + `year` (+ `merchant_name`, `limit`, `offset` per spec). `dept_code`/`budget_*`/`winner_tin` are not part of it.

## 3. `contract` array (200-row page, year 2569, keyword "พัฒนาระบบ")
- **[Verified]** `contract` is an **array**, never empty in 200 rows: 174 rows with 1 entry, 26 with 2-9. Dates are Thai short text (`"29 เม.ย. 69"`), and `contract_finish_date` can be `"-"`.
- **[Verified]** Multiple entries come in two kinds:
  1. **Joint venture:** a "กิจการค้าร่วม/กิจการร่วมค้า/Consortium" line carries the full price, and member companies ("บริษัทจำกัด บริษัท X ... (สัญญากิจการค้าร่วม)") share the **same `contract_no`** with partial amounts or **0**.
  2. **Separate contracts** (different `contract_no`) for different items or winners.
- **[Verified]** Summing `price_agree` over all entries **double counts joint ventures**. For JV projects `sum_price_agree` equalled the consortium line (e.g. 318,450,000). For separate contracts it equalled the sum (28,064,388 = 8,939,208 + 19,125,180). Other cases not checked, so use `sum_price_agree` as published and keep entries separate.
- **[Verified, 1 case of 200]** `sum_price_agree` (61,846,674) can exceed `project_money` (57,867,665).
- **[Verified]** Contract year vs announcement year differ: project 68049277788 has `announce_date` "15 ก.ย. 68" (FY2568) and `year` 2569 (signed 29 เม.ย. 69). All 200 rows had `project_status` "ระหว่างดำเนินการ".

## 4. Submissions and `seq_no` (5 projects)
- **[Verified]** `seq_no` and `seq_no_desc` are on the **record**, not inside `bidder[]` as the spec table suggests. A record is one **line item** (`seq_no` 1..N, `seq_no_desc` = item name); `bidder[]` lists who bid on that item. It is not a ranking and not a round (in these 5 projects: four single-item, one three-item).
- **[Verified]** `submit_price` is a **string** (`"3000000.00"`), not a number.
- **[Verified]** Wrong contract year returns `total: 0` (`year=2568` for a 2569 contract), so `year` must be the contract's fiscal year.
- **[Verified, 1 multi-item project]** One project had 6 bidder rows but only **3 distinct companies** (each bid on all 3 items; 2 bidders per item). Raw row count would be 2x wrong.
- **Counting rule (proposed, supported by 5 projects only):** project-level unique bidders = distinct exact `merchant_name` across all records; also keep per-item counts. Submissions carry no TIN, so two spellings of one company would be counted twice **[Open: not seen in these 5, not ruled out]**.
- **[Open]** Whether a bidder can appear twice in one item (resubmission); not seen.
- **[Open]** `bidder[]` may include disqualified bidders; the data has no status field.

## 5. Submitted bid price vs agreed contract price vs "winner"
- **[Verified]** They are different numbers. `submit_price` is what a bidder offered. `price_agree` is on the contract. In the sample the agreed price was **equal** in 2 projects (2,995,000; 2,900,000) and **lower than the winner's bid** in the others (2,830,000 vs 2,850,000; JV 49,450,000 vs 49,500,000). For the 3-item project the agreed prices (8,939,208; 19,125,180) do not equal the sum of that winner's submitted item prices; which items each contract covers is **[Open]**.
- **[Verified, 2 of 5]** The winner is **not always the lowest bidder**: 3 bidders were below the winner in one project (1,890,000 and 2,098,270 against a winner at 2,850,000), and 1 in another (49,200,000 vs 49,500,000). The reason (disqualification, price-performance scoring) is not in the data **[Open]**.
- **[Verified, small]** Winner-to-bid matching by exact `winner_name == merchant_name` worked for all 6 non-JV winners in the 5 projects. It **fails for JV members** (different name format, no TIN on submissions). So "winner's submitted bid" is feasible for non-JV winners with exact match and must be labelled as matched by name.
- **[Assumption]** `price_agree` is the agreed contract price for that entry (the spec labels it "contract budget amount", ambiguous). It is consistent with the data above but not proven.

## 6. Existing code vs reality (bugs found in Phase 0; status after Phase 2a in brackets)
- `apps/api/src/services/egp/contract-client.ts` types `seq_no`/`seq_no_desc` inside `bidder[]`; `contracts.service.ts` reads `bidder.seq_no`. Real data has them on the record, so **`seqNo`/`seqNoDesc` were always stored as null** and the item structure was lost. [Fixed in Phase 2a: read from the record.]
- `submit_price` is typed `number` but arrives as a string; parse and validate it (empty/invalid → null, never 0). [Fixed in Phase 2a: parsed strictly; a sent-but-unreadable price is stored empty and counted in a warning.]
- Code flattens all bidders and loses which item a bid belongs to (needed for per-item counts). [Fixed in Phase 2a: each stored bid keeps its `seqNo`/`seqNoDesc`; per-item and per-project counts are not computed yet.]
- No handling of JV entries (consortium vs member lines) when presenting winners. [Open: Phase 3; ADR-0022 rule 4.]
- The `request` echo (it contains the api-key): `openDataGet` already returned only the data rows, total and quota, so the echo was never stored or returned. [Phase 2a added redaction of the key from every error message the open-data client throws, because the API's own `message` and transport-error text were not covered, and tests for both.] Raw response bodies must still never be logged, stored or committed.
- Contract dates are stored exactly as the API sends them (Thai short text or `"-"`); they are not parsed. [Open.]

## 7. Bulk download (Q2)
- **[Verified]** `https://govspending.data.go.th/bulk/download` is a form (API source, service, fiscal year) that requires an API key/e-mail. The page states no licence or terms of use, only "rights reserved" (สพร.).
- **[Open]** Whether bulk download fits the research authorisation. Do not use it until you confirm.

## 8. Status of the plan's assumptions
| Item | Status |
|---|---|
| A1 winner-to-bid by name | Partly verified (non-JV, 6/6 in 5 projects); fails for JV members. Hide for JV |
| A2 contract year vs our `budgetYear` | **[Open]**. Contract year can differ from announcement FY (verified); relation to an ingested project's `budgetYear` not tested (needs a real ingested project) |
| A3 `price_agree` meaning | Assumption, consistent with data; keep contract entries separate; JV caution |
| A4 quota 1000/day | **Verified** (header); the 429 behaviour is open |
| Q1 `seq_no` | **Answered** (line item index), 5 projects |
| Q2 bulk CSV | **Open** |
| Q3 "similar" rule | `dept_code` + local `project_type_name`/budget-band filter is feasible; use `project_money` locally, because API `budget_*` filters on agreed price |
| Q4 API key | **Resolved** (a key exists, 1000/day) |

## 9. Limits of this evidence
5-6 projects, one fiscal year, one keyword. No multi-item project beyond 3 items, no case of a repeated bidder in an item, no 429. Widen only if a later phase depends on one of those.
