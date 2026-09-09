# torfun

Finds Thai government software procurement a Bangkok software house can credibly
bid on, so a person reads the ten opportunities that matter instead of the four
hundred that don't.

## Language

### The core entity

**Procurement**:
One government procurement project, identified upstream by an 11-digit
`projectId`. The single record the whole system is built around — it carries what
the open-data API published, what the retrieval stage fetched, and what the AI
read.
_Avoid_: Tor, IngestionRecord, Project, Announcement, Opportunity

**TOR**:
The Terms of Reference document — the PDF stating what an agency actually wants
built. A TOR is a *document attached to* a Procurement, never the Procurement
itself.
_Avoid_: spec, requirements doc

**Archive**:
The ZIP a procurement announcement publishes, containing the TOR alongside
unrelated documents (bonds, contracts, quotations, the announcement itself).
_Avoid_: package, bundle, zip file

### Pipeline stages

**Discovery**:
The cheap, broad sweep of the open-data API that finds Procurements and buckets
them by a heuristic over their Thai titles.
_Avoid_: crawl, scrape, scan

**Retrieval**:
The slow, rate-limited, per-run-capped stage that fetches a Procurement's Archive,
stores its documents, and has them read. Deliberately separate from Discovery.
_Avoid_: download, fetch, ingest

**Run**:
One execution of Discovery followed by Retrieval, bounded by a per-run download
cap and never overlapping another. What a Site Administrator starts and what the
failure log is grouped by.
_Avoid_: job, sweep, batch, ingestion

**Source Registry**:
The fixed list of Thai agency names the system collects under. Membership is a
product decision, not a configuration value.
_Avoid_: agency list, sources, whitelist

### Status vocabulary

Four separate lifecycles live here, and the word "status" is claimed by two of
them. They are never interchangeable.

**Procurement Status**:
Where a Procurement sits in the *agency's own* e-GP lifecycle — from
`drafting_tor` through `invitation` (the only window in which a bid is possible)
to `contracted` or `cancelled`. Owned upstream; the system only reads it.
_Avoid_: project status, stage, phase

**State**:
Where a Procurement sits in *this system's* retrieval lifecycle — Queued,
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
the *pair* (officer, procurement), never of the Procurement — one officer's
rejection must not hide a Procurement from their colleagues.
_Avoid_: status, verdict, decision

**Winner**:
The supplier that was awarded a Procurement, with the contract that records it
and the price the work actually sold for. Absent where no award exists — which
is the only reliable signal that a Procurement is still open to a bid.
_Avoid_: contractor, vendor, supplier, awardee

### What the system infers

**Software Class**:
How likely a Procurement is to be software work, guessed from its Thai title
alone. Directional triage — good enough to order a queue, never good enough to
quote as a statistic or to filter on without a human path around it.
_Avoid_: category, classification, type

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

### People

**Business Development Officer**:
The person deciding whether a Procurement is worth days of bid preparation. Every
self-registration creates one.
_Avoid_: user, BD, salesperson

**Site Administrator**:
The person who runs and monitors Retrieval and reviews what failed. Granted,
never self-claimed.
_Avoid_: admin user, superuser, operator
