# ADR-0022: Read GovSpending open data for awards, bids and prices

- Status: **Proposed**. Needs the owner's sign-off because it reverses the "open-data API is not read" line in `AGENTS.md` (attributed there to ADR-0004), and because the research authorisation's own limits are not recorded in this repository.
- **Deployment gate:** permission and terms of use for this API and its data **must be confirmed before TORfun is deployed or opened to anyone beyond the project team**. Nothing in this ADR grants or assumes that permission (see "Scope and authorisation").
- Date: 2026-11-20
- Issue: #141 (bid strategy epic). Evidence: `docs/research/bid-strategy/phase0-findings.md` and its sanitized samples.

## Context
The bid strategy features (#142 to #144, #61, price suggestion) need, for past procurements: who won, the agreed price, who bid, and the submitted bid prices.
`AGENTS.md` says the open-data API is not read because it holds only signed contracts. That is true, and it is the reason it suits this need: the questions are about
**past** procurements. Winner fields were dropped from procurements on 2026-10-08 because nothing real fed them. They return only with a real source.

## Decision
Use the GovSpending open-data API (`opend.data.go.th/govspending/service`) as the source for awards and bids:

| Data | Endpoint | Field |
|---|---|---|
| Winner(s), agreed contract price, budget, reference price | `egp-contract` | `contract[]`, `sum_price_agree`, `project_money`, `price_build` |
| Bidders and their submitted prices, per line item | `egp-contract-submit` | `data[]` records (`seq_no`, `seq_no_desc`, `bidder[]`) |
| Agency code lookup | `egp-dept` | `dept_code` by name |

Not used: bulk CSV download, the process5 search, any captcha-protected page.

### Data rules (decided from the Phase 0 samples)
1. **Submitted bid price and agreed contract price are separate things and separate fields.** `submit_price` is what a bidder offered; `price_agree`/`sum_price_agree` is on the contract and was observed to be lower than the winner's bid in 3 of 5 sampled projects. The agreed price is never labelled a winning bid.
2. **"Winner's submitted bid" is shown only when the winner's name exactly equals one bidder's `merchant_name`** and the winner is not a joint-venture member line. Otherwise it is empty. It is labelled as matched by name.
3. **Bidders are counted per project as distinct exact `merchant_name` across all records**, and per line item separately. Raw row counts are never shown as a bidder count. If the bidder list is missing or empty, the count is empty, not 0 or 1.
4. **Joint ventures: consortium lines and member lines are different things, and members are never counted as separate winners automatically.**
   - In the samples, a joint venture appeared as a consortium line ("กิจการค้าร่วม", "กิจการร่วมค้า", "Consortium") plus member-company lines sharing the same `contract_no`, with partial or 0 prices. That pattern was seen in a handful of projects; it is an observation, not a documented rule, and the API does not flag which line is which.
   - Classification is a heuristic (name prefix, shared `contract_no`) and can be wrong. Never present a member line as a winner by itself, and never add member amounts to the consortium amount.
   - When the award structure is ambiguous (several lines under one `contract_no` that do not clearly resolve to one consortium plus its members, or any other unclear multi-line case), **leave the winner unresolved**: show the contract lines as published, mark the winner "unresolved", and compute nothing from them (no winner count, no winner-to-bid match).
   - Separate contracts (different `contract_no`, e.g. different items or lots) are separate awards and are kept as separate entries.
5. **`sum_price_agree` is the API-published aggregate, not an independently verified total.** It is shown and used as published, labelled as open data. In the samples it was consistent with the consortium line (joint venture) and with the sum of contract lines (separate contracts), and in one project it exceeded `project_money`. Those are observations, not a guarantee, so it is never presented as confirmed, and it is not recomputed or "corrected" from the lines.
6. **Project identity and fiscal year are unverified until tested against a real ingested TORfun project.**
   - **Unverified: it is not known whether the open-data `project_id` is the same identifier as the e-GP project id TORfun stores.** This ADR does not adopt "they match" as an assumption to build on. The only evidence is that both look like 11-digit numbers; no ingested TORfun project has been compared with an open-data record. Until that comparison is made on real ingested projects, no feature may link a TORfun procurement to open-data contracts by `project_id` and present it as that procurement's award. A mismatch, or a project that cannot be found, is shown as "no contract data found", never as a guessed link.
   - The contract `year` is the contract's fiscal year. It was seen to differ from the announcement fiscal year (announced FY2568, signed FY2569). Its relationship to TORfun's stored `budgetYear` is **unknown**: do not derive one from the other. A project is looked up by `project_id` over a window of fiscal years, and the match is trusted only after verification against real ingested projects.
7. **The API's `budget_start/budget_end` filter the agreed price, not the budget.** Budget comparisons filter on `project_money` locally.
8. **The `request` echo never leaves the client, and the key never leaves in an error.** The API returns the caller's `api-key` in every response body. The client returns only the data rows, the total and the quota reading (it always did); since Phase 2a every error it throws also has the key removed from its message and stack, including text that came from the API or the network. Raw responses are never logged, stored or committed.
9. **Missing values stay empty; nothing is repaired or guessed.**
   - `submit_price` arrives as a numeric string. It is parsed strictly; an empty or unreadable value is stored empty, never 0. A price the API sent that cannot be read is **counted and logged as a warning (the count only, never the value)** per project and year, so it is surfaced, not swallowed.
   - A line item number that is not a positive integer is stored empty.
   - **Contract dates are NOT parsed.** `contract_date` and `contract_finish_date` are stored exactly as the API sends them: Thai short text such as "29 เม.ย. 69", or "-" when there is none. A "-" is therefore stored as "-", not as empty. Until a later step converts them (the existing `convertDateToISO` reads this format), they must not be sorted, compared or shown as dates, and no feature may treat "-" as a date. This is a known gap against "missing stays empty", listed under Unresolved.
10. **Open data is presented as open data**: each figure shows its source and fiscal year and is labelled "from open data, verify before bidding". Nothing is presented as confirmed fact.
11. **`keyword` may be used to find comparables but never decides whether a procurement is software** (AGENTS.md: a title is not a verdict).

### Scope and authorisation
**What TORfun is.** A university project built to work as a functional system: a real pipeline over real data with a working web app, so that its behaviour can be demonstrated and evaluated. It is **not a commercial product**: nothing here is sold, no commercial service is offered, and no business, uptime or scale commitments are made. The story in `AGENTS.md` (a software house finding bids) describes the problem the system is built to solve, not a commercial deployment.

What that scope does and does not settle:
- **Development and research use** (building and testing the pipeline, running it with a registered key, collecting the sanitized samples): in scope. Phase 0 used about 12 calls. TORfun operates under a research authorisation whose own limits are not recorded in this repository, and this ADR does not interpret them.
- **A deployed, working system** (the sync running on a schedule against the real API, data stored in the project's database, shown in the web app): in scope as the project goal, but **whether the API's owner permits it is not confirmed.** Non-commercial and academic purpose may matter to the owner, but it is not stated on any page seen, and this ADR does not assume it. The pages read (the API documentation landing page and the bulk download page) give no terms of use or licence, only "rights reserved".
- **Not in scope:** commercial use, selling or redistributing the data, offering it as a service to third parties, or publishing the stored data in bulk.

**Required before deploying or opening the system to anyone beyond the project team** (for example the public, or other students): confirm with the API's owner (or through the research authorisation) that this use is allowed, that the quota (1000 calls/day) suffices, that storing and displaying the data is allowed, and what attribution applies. This confirmation is not recorded in this repository and is not assumed here. Until it is, run only for development, testing and demonstration within the project team. The status stays Proposed.

**Data-safety requirements that apply regardless of scope** (they are the project's own rules, not consequences of permission):
- Every response echoes the API key (`request.api-key`): never log, store, commit or return a raw response, and never put the key in a URL that is logged, in tests, or in docs (the existing `redactUrl` is for URLs, not for bodies).
- Real data only: no seeded, mocked or backfilled contract records. Test fixtures are labelled as fixtures and never enter the database outside tests.
- Source and uncertainty are always shown (rule 10): open data is labelled as such, with its fiscal year, and nothing is presented as confirmed fact.
- Personal data is kept to what is needed: company names and agreed prices from the API are shown; anything about individuals (for example a sole proprietor's name) is not exported or republished in bulk. Phase 0 samples have coordinates removed and TINs masked.
- Quota is a shared public resource: calls are serial and stop on refusal, and there is no unbounded or parallel crawling.

### Fit with the guardrails
- Not captcha-protected: the key-based API answered normally; no Turnstile page was involved.
- Not part of the e-GP site gate: calls go to `opend.data.go.th`, not `gprocurement.go.th`.
- **Cooldown, checked against the code (`contracts.service.ts`, `govspending-cooldown.repository.ts`, `egp/client.ts`) and its tests (21 tests across the contract service, contract client and cooldown repository passed):**
  - Confirmed: after a 429, a 403 or an exhausted daily quota, the contract sync stores a 24-hour cooldown in MongoDB (ingestion meta collection), and the sync checks it before each year, each page and each project, so it makes no further contract calls until it expires. It survives a service restart (a test covers a new service instance reading the stored cooldown). Requests inside the sync run one after another, with `openDataDelayMs` between pages.
  - Limits, not claims of more: the cooldown is a stop **after** a refusal, not a way to avoid one; the refused request has already been sent. A 5xx or transport error does not set it. The 24 hours is a fixed constant, not derived from the API.
  - **Not covered:** `diagnostics.service.ts` calls the open-data API (`egp-dept`) in the health check and does not check the cooldown, so health checks can still send requests during one. Whether two API instances starting at the same moment could both pass the check before either stores the cooldown was not examined (a per-year lease exists but its effect on this race was not verified).
  - The cooldown covers the existing contract sync only. Any new open-data call added later must be wired to it, or it is not covered.
- Quota: 1000 calls per day, confirmed by `x-ratelimit-*` response headers.
- No seeded or mocked records. Contract data is read only from real API responses.

## Alternatives
- **e-GP winner announcement in the project timeline: NOT EVALUATED.** #141 asks for it. Phase 0 did not read e-GP (it needs gated calls to `gprocurement.go.th` and was out of scope), so this ADR does not claim the open-data API is better, only that it is verified to provide the data. If the timeline publishes winners earlier (before contract signing), it may serve open procurements that open data cannot. Evaluate before relying on it.
- **Bulk CSV download:** not used. The page requires an API key or e-mail and states no licence or terms; whether it fits the authorisation is unknown. A university project's convenience does not decide that.

## Consequences
- `AGENTS.md`, `apps/api/AGENTS.md`, `apps/api/.env.example`, `README.md`, the `constants.ts` comment and the CONTEXT.md "Winner" entry are updated to say the open-data API is now read for awards, bids and prices (not for discovery).
- The existing client and service needed fixes before they could be relied on.
  - **Done in Phase 2a:** `seq_no`/`seq_no_desc` are read from the record, so each bid keeps its line item (they were stored as null); `submit_price` is parsed from its string, with unreadable values stored empty and counted in a warning; the fiscal-year window is derived from the current Thai fiscal year instead of a hard-coded list; and the API key is removed from every error message the open-data client throws. (The `request` echo itself was never stored or returned; no fix was needed there.)
  - **Remaining:** joint-venture consortium/member handling and winner derivation (rule 4); bidder counts per project and per item (rule 3); parsing of contract dates (rule 9); verifying the `project_id` link and `budgetYear` relation on real ingested projects (rule 6); reducing quota use and making quota and years configurable; the health-check cooldown gap and the multi-instance race.
- Winner data exists only after a contract is signed, so it informs "similar past procurements", not whether a currently open procurement is already awarded.

## Unresolved
- Does the research authorisation cover this API, and does it permit a deployed, non-commercial system that stores and displays the data to anyone beyond the project team (no terms are stated on the pages seen)? **Must be confirmed before deployment or wider access; not assumed.**
- Who can confirm it (the API's owner, or the owner of the research authorisation), and where the answer will be recorded.
- e-GP timeline winner announcement: coverage and timing versus open data (not evaluated).
- **Unverified until tested against a real ingested TORfun project:** whether the open-data `project_id` equals the stored e-GP project id (only the 11-digit format was compared), and how the contract `year` relates to the stored `budgetYear`.
- Whether the health check's open-data call should honour the cooldown, and whether concurrent API instances can both pass the cooldown check at once (not examined).
- How to recognise a joint-venture consortium line versus its member lines reliably, and which multi-line awards must stay "unresolved" (only a handful of cases seen).
- Contract dates are stored unparsed (Thai text or "-"); when to convert them, and what "-" should become.
- Whether `sum_price_agree` is always consistent with the contract lines (not independently verified).
- Can one company appear under two spellings in submissions (not seen in 5 projects, not ruled out)?
- Why the winner is sometimes not the lowest bidder (not in the data).
- Behaviour at quota exhaustion (429 vs other) and `offset` paging, not tested.
- Whether a minimum sample of similar procurements can be reached with 1000 calls/day.
