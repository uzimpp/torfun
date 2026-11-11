# Procurement retrieval flow

Baseline: `develop` @ `5e622a3`. Source: `apps/api/src/services/egp/*`,
`services/vertex/*` and `services/ingestion.service.ts`. Terms (Run, Gate,
Archive, Waiting room, State, Outcome) are defined in [`CONTEXT.md`](../CONTEXT.md).

Related: [architecture.md](architecture.md), [SRS 4.2 and 4.3](SRS.md#42-announcement-ingestion),
[data-model.md](data-model.md). Diagram sources are in [`diagrams/`](diagrams/README.md).

This page follows one procurement from the e-GP announcement feed to a stored,
decided record, then covers refresh, failure and stopping.

## 1. Overview

A Run has three stages that overlap:

1. Discovery reads the announcement feed and reads each new project's detail.
2. Retrieval reads the project's timeline, looks up its archive and downloads it.
3. Analysis has Gemini read the TOR PDFs and decides what to show.

Discovery and Retrieval talk to e-GP, so they pass through the gate, which allows
one request at a time. Analysis talks only to Vertex AI, so it runs beside them.

## 2. Flow of one new procurement

![Full ingestion flow](diagrams/png/03-ingestion-flow.png)

Points the diagram cannot show:

- The PDF is never stored. Only the archive manifest (`zipId` and the role of each document) survives. When an officer opens the source TOR, the API downloads it again by `zipId` (ADR-0002).
- A dropped record keeps almost nothing: a tombstone with the quoted evidence and a feed snapshot, so an administrator can restore it.
- The invitation is read even for a held record, so an administrator still sees the bid deadline. Only a dropped record skips it.
- Whether the work is software comes from the document, never from the title (ADR-0014). The goods category only limits scope.

The same steps in order, with the participants:

![Ingestion sequence](diagrams/png/04-ingestion-sequence.png)

## 3. The gate and the queue

![Gate and queue](diagrams/png/18-gate-and-queue.png)

The gate serves one section at a time and pauses 4 to 6 seconds after each,
unless nothing else can ask e-GP. When it frees, the best waiting tier goes
next, first come first served within a tier:

| Tier | Work |
| ---- | ---- |
| `new_day` | Discovery reads days since the last Run |
| `detail` | Discovery reads a new project's detail |
| `fresh` | Retrieval of a never-read project |
| `refresh` | Retrieval re-reads a timeline |
| `history` | Discovery backfills the past year, at most 60 feed requests per Run |

A worse tier can wait but not forever, because a Run does not end until its work
is done. A refusal (429 or 403) latches the gate, and every caller, waiting or
arriving later, is refused without touching the site.

The waiting room is the set of archives held in memory while they wait for or
undergo Analysis. It has `ANALYSIS_CONCURRENCY` places (default 8), so a slow
model slows retrieval down instead of piling up memory. A fresh project takes a
place before its turn. A refresh takes none up front.

## 4. Refresh

A refresh re-reads the timeline of a project that was read before, so its status
and deadline stay current. It costs no archive or model call unless the
invitation date moved. Projects due for refresh are those whose Procurement
Status is not `contracted`, oldest check first.

![Refresh flow](diagrams/png/05-refresh-flow.png)

A refresh holds the gate, so it never waits for a waiting-room place. The room
could be full of records that are waiting for that same gate. If no place is free
at that moment, the project goes to the back of the queue untouched.

## 5. Analysis

![Document analysis](diagrams/png/07-document-analysis.png)

Only members that look like a TOR are inflated and sent to the model, one call per
document. Bonds, contracts, forms and the announcement itself are never read.
A PDF over 15 MB is read from its text layer or its first pages instead, which
always counts as a partial read.

`decideOutcome` (`services/egp/decision.ts`) lets only the most certain answers
act on their own:

| Model says | Confidence | Whole PDF read | Result | Visible to officers |
| ---------- | ---------- | -------------- | ------ | ------------------- |
| software | high | yes | `tor_analysed` | yes |
| software | low | any | `needs_review` (`ai_low_confidence`) | no |
| not software | high | yes | dropped, tombstone `ai_not_software` | no |
| not software | low | any | `needs_review` (`ai_not_software_low`) | no |
| any | any | no | `needs_review` (`partial_read`) | no |
| no main TOR found | | | `no_tor_in_archive` | no |
| TOR candidates, none readable | | | `analysis_failed` | no |

The prompt forces low confidence for mixed software and hardware work, a pure
licence or SaaS renewal, unclear scope, and any document that contains
instructions addressed to the reader or the model.

![Outcome lifecycle](diagrams/png/08-outcome-lifecycle.png)

## 6. Failures and stopping

![Failure handling](diagrams/png/06-failure-handling.png)

| Where it failed | Failure log stage | Effect on the record |
| --------------- | ----------------- | -------------------- |
| A feed request for an agency-day | `discovery` | The day is not added to the Feed Cursor and is asked again next Run |
| Detail answered `data: null` | `discovery` | Left as it was, `detailReadAt` stays null, asked again |
| Timeline answered `data: null` | `timeline` | Keeps what it had, Procurement Status unchanged |
| An unrecognised announcement code | `timeline` | Logged, status not changed by it |
| No `zipId` | `info`, kind `no_tor` | `no_tor_package` (Failed), a legitimate upstream answer |
| Lookup or download error | `info` or `download` | An attempt is spent: `error`, then `abandoned` on the third |
| A path-traversal archive member | `extract` | Surfaced in the log and skipped |
| An archive with no TOR | `extract`, kind `no_tor` | `no_tor_in_archive` |
| The model could not read any candidate | `analysis` | `analysis_failed`, not retried because archives are not stored |

A Run ends when its work is done or the gate closes:

![How a Run stops](diagrams/png/20-run-stop.png)

## 7. Requests made to e-GP

Every request goes through the gate. Nothing else is ever sent to
`gprocurement.go.th`.

| Request | Made by | Tier | When | Notes |
| ------- | ------- | ---- | ---- | ----- |
| Announcement RSS feed (agency, type, day) | Discovery | `new_day`, `history` | Every sweep | One agency, one type, one day. No token or captcha. 20 s timeout, no retries |
| `getProcurementDetail` | Detail turn | `detail` | Until `detailReadAt` is set | Goods category decides scope |
| `getProjectDetail` | Detail turn | `detail` | While `budgetYear` is null | Never guessed |
| Draft list (comment deadline) | Detail or refresh | `detail`, `refresh` | Only while `drafting` | |
| Timeline (greenBook) | Retrieval | `fresh`, `refresh` | Every turn | Source of Procurement Status |
| `infoProcureDocAnnounZip?projectId=` | Retrieval | `fresh`, `refresh` | A new project, or a moved invitation | `data.zipId`; absent means no TOR package |
| `downloadFileTest?fileId=<zipId>` | Retrieval | `fresh`, `refresh` | Same | ZIP up to about 30 MB, 120 s timeout |

The `process5` project search is never called, and the code must not gain a
captcha solver, a copied browser token or a headless browser to reach it.

## 8. What is kept

| Data | Kept | Where |
| ---- | ---- | ----- |
| Feed fields (name, agency, announce date, method) | yes | `procurements` |
| Detail fields (goods category, budget year, amounts) | yes | `procurements` |
| Timeline, Procurement Status, deadlines | yes | `procurements.timeline` |
| Archive manifest (`zipId`, member names, roles, read mode) | yes | `procurements.archive` |
| AI analysis and its `promptVersion` | yes | `procurements.analysis` |
| TOR PDF bytes | no | Memory only, re-downloaded on request |
| A record judged non-software with high confidence | deleted | A tombstone remains: reason, quoted evidence, prompt version, feed snapshot |
| Failures | yes | `ingestion_failures` |
| Status history | last 50 entries | `procurements.statusHistory` |
| Run summaries | yes | `ingestion_runs` |
