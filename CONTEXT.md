# torfun

Finds Thai government software procurement a Bangkok software house can credibly
bid on, so a person reads the ten opportunities that matter instead of the four
hundred that don't.

## Language

### The core entity

**Procurement**:
One government procurement project, identified upstream by an 11-digit
`projectId`. The single record the whole system is built around — it carries what
the announcement feed published, what the retrieval stage fetched, and what the AI
read.
_Avoid_: Tor, IngestionRecord, Project, Announcement, Opportunity

**TOR**:
The Terms of Reference document — the PDF stating what an agency actually wants
built. A TOR is a _document attached to_ a Procurement, never the Procurement
itself.
_Avoid_: spec, requirements doc

**Archive**:
The ZIP a procurement announcement publishes, containing the TOR alongside
unrelated documents (bonds, contracts, quotations, the announcement itself).
_Avoid_: package, bundle, zip file

### Pipeline stages

**Discovery**:
The stage that reads e-GP's announcement feed (RSS), one Source Registry agency,
one announcement type (draft TOR B0, invitation D0) and one day per request, and
admits the e-bidding projects that have no tombstone. No title is consulted.
Each new project is stored as Queued at once and handed to Retrieval.
_Avoid_: crawl, scrape, scan

**Retrieval**:
One turn at the Gate per Procurement: its project detail (until it has been read
once), its announcement timeline (greenBook), the Archive lookup and the
download. No per-Run cap (ADR-0015). The Archive is held in memory for Analysis
and never stored (ADR-0002, TOR documents are not stored).
_Avoid_: download, fetch, ingest

**Run**:
One execution of Discovery, Retrieval and Analysis side by side, never
overlapping another Run. It ends when all three are done, or once the Gate is
closed — by a refusal, a site that stopped answering, or an administrator's
stop — and Analysis has finished the Archives it holds. What a Site
Administrator starts and what the failure log is grouped by.
_Avoid_: job, sweep, batch, ingestion

**Gate**:
The one way a Run reaches e-GP: one request at a time, a pause after each, the
next turn to the best tier waiting (new days, never-read projects, refreshes,
history). A refusal latches it; any other stop closes it. Either way no further
request is made that Run.
_Avoid_: lock, throttle, rate limiter

**Waiting room**:
The Archives a Run holds in memory, waiting for or under Analysis. It has as many
places as Analysis has model calls (`ANALYSIS_CONCURRENCY`); when it is full,
Retrieval of new projects waits.
_Avoid_: buffer, cache

**Source Registry**:
The fixed list of Thai agency names the system collects under. Membership is a
product decision, not a configuration value.
_Avoid_: agency list, sources, whitelist

### Status vocabulary

Four separate lifecycles live here, and the word "status" is claimed by two of
them. They are never interchangeable.

**Procurement Status**:
Where a Procurement sits in the _agency's own_ e-GP lifecycle — from
`drafting_tor` through `invitation` (the only window in which a bid is possible)
to `contracted` or `cancelled`. Owned upstream; the system only reads it.
_Avoid_: project status, stage, phase

**State**:
Where a Procurement sits in _this system's_ retrieval lifecycle — Queued,
Processing, Completed, Failed. Owned by the pipeline.
_Avoid_: status, progress

**Outcome**:
Why a Procurement reached its State, at a finer grain than State can express —
distinguishing "no TOR was ever published" (a legitimate upstream answer) from a
transport failure. Both are surfaced; only one is anyone's fault, and only one
is worth retrying.
_Avoid_: reason, result, error code

**Review Status**:
A Business Development Officer's own judgement of a Procurement. A property of
the _pair_ (officer, procurement), never of the Procurement — one officer's
rejection must not hide a Procurement from their colleagues.
_Avoid_: status, verdict, decision

**Winner**:
The supplier that was awarded a Procurement, with the contract that records it
and the price the work actually sold for. Absent where no award exists — which
is the only reliable signal that a Procurement is still open to a bid.
_Avoid_: contractor, vendor, supplier, awardee

### What the system infers

**Document Role**:
What a document inside an Archive turned out to be — the main TOR, a draft or
otherwise superseded TOR, or not a TOR at all. Decided by reading the document,
never by matching its filename.
_Avoid_: type, kind, category

**Analysis**:
What Gemini extracted from a Procurement's main TOR: a summary, scope, budget,
deadline, tech stack, qualifications. A time-saving summary, never an authority —
the Archive stays reachable upstream so a human can verify before bidding.
_Avoid_: extraction, AI result, summary (as a noun for the whole block)

### The vendor's own record

**Company**:
The software vendor a Business Development Officer works for, identified by its
Thai registered name and, where given, its TIN. The side of a match that
`Procurement` is scored against. Belongs to Business Development Officers only —
a Site Administrator never holds one.
_Avoid_: vendor, firm, organisation, account, tenant

**TIN**:
เลขประจำตัวผู้เสียภาษีอากร — the 13-digit number identifying a Thai juristic
person, the same number the DBD registers the company under. Optional, and
recorded rather than relied on.
_Avoid_: tax ID, registration number, company number

**Client**:
An organisation a Company has delivered work for. Never the Company itself, and
never a user of this system — a Client has no account and never signs in.
_Avoid_: customer, buyer, agency, department

**Experience**:
One piece of work a Company delivered for a Client, described in the same
vocabulary a TOR is read into — platforms, tech stack, duration — so that a past
job and a tender can be compared at all.
_Avoid_: Project, past project, portfolio item, engagement, case study

### People

**Business Development Officer**:
The person deciding whether a Procurement is worth days of bid preparation. Every
self-registration creates one.
_Avoid_: user, BD, salesperson

**Site Administrator**:
The person who runs and monitors Retrieval, reviews what failed, and manages
the other accounts — activating them, and granting or revoking this role.
Granted, never self-claimed; holds no Company. The system keeps at least one.
_Avoid_: admin user, superuser, operator
