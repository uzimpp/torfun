# torfun

torfun finds Thai government software procurement that a Bangkok software house can credibly bid on. It reads each Terms of Reference with AI and scores it against the company's past work, so a person reads the ten opportunities that matter instead of the four hundred that don't.

## Language

### Procurement

**Procurement**:
One government procurement project, identified by the 11-digit `projectId` that e-GP assigns. Everything the system knows about a project hangs off this record.
_Avoid_: Tor, Project, Announcement, Opportunity

**TOR**:
The Terms of Reference, the PDF that states what an agency wants built. A TOR is a document attached to a Procurement, never the Procurement itself.
_Avoid_: spec, requirements doc

**Archive**:
The ZIP file an announcement publishes. It holds the TOR next to unrelated documents such as bonds, contracts, and quotations.
_Avoid_: package, bundle, zip file

**Source Registry**:
The fixed list of Thai agencies the system collects from. Adding or removing an agency is a product decision, not a setting.
_Avoid_: agency list, whitelist

**Winner**:
The supplier awarded a Procurement, with the contract and the agreed contract price. That price is not the winner's submitted bid (they differ: the agreed price is often lower), and a joint venture lists the consortium and its members as separate contract lines. Read from signed contracts only, so absence means no signed contract was found, not that the Procurement is open.
_Avoid_: contractor, vendor, awardee

### Pipeline

**Discovery**:
The stage that reads e-GP's announcement feed and admits new e-bidding projects. It never looks at a project's title.
_Avoid_: crawl, scrape, scan

**Retrieval**:
The stage that fetches a Procurement's detail, timeline, and Archive from e-GP.
_Avoid_: download, fetch, ingest

**Analysis**:
The stage where Gemini reads an Archive's TOR and extracts a summary, scope, budget, deadline, tech stack, and qualifications. It is a time-saving summary, never an authority. A person verifies it against the original document before bidding.
_Avoid_: extraction, AI result

**Run**:
One execution of Discovery, Retrieval, and Analysis together. Only one Run is live at a time, and a Site Administrator starts it.
_Avoid_: job, sweep, batch, ingestion

**Gate**:
The single path every request to e-GP passes through. It sends one request at a time, pauses after each, and closes for the rest of the Run on a refusal or other failure.
_Avoid_: lock, throttle, rate limiter

**Waiting room**:
The Archives a Run holds in memory while they wait for Analysis. When it is full, Retrieval of new projects waits.
_Avoid_: buffer, cache

### Status

A Procurement has four separate lifecycles. They are never interchangeable, and the word "status" belongs to only two of them.

**Procurement Status**:
Where a Procurement sits in the agency's own e-GP lifecycle, from drafting the TOR, through invitation (the only window in which a bid is possible), to contracted or cancelled. e-GP owns it. The system only reads it.
_Avoid_: project status, stage, phase

**State**:
Where a Procurement sits in this system's retrieval lifecycle: Queued, Processing, Completed, or Failed.
_Avoid_: status, progress

**Outcome**:
Why a Procurement reached its State, in finer detail than the State shows. It separates "the agency never published a TOR", which is a legitimate answer, from a failure that is worth retrying.
_Avoid_: reason, result, error code

**Review Status**:
A Business Development Officer's own judgement of a Procurement. It belongs to the pair of officer and Procurement, so one officer's rejection never hides a Procurement from a colleague.
_Avoid_: status, verdict, decision

**Needs review**:
A Procurement the AI could not classify with confidence. Officers cannot see it until a Site Administrator approves it, marks it non-software, or queues it to be read again.
_Avoid_: held, flagged, pending

**Tombstone**:
The record left behind when a Procurement is dropped as non-software. It stops the project from being ingested again, and an administrator can restore it.
_Avoid_: blacklist, blocklist

### What the system infers

**Document Role**:
What a document in an Archive turned out to be: the main TOR, a draft or superseded TOR, or not a TOR at all. The system decides it by reading the document, never from the filename.
_Avoid_: type, kind, category

**Match**:
The score of one Procurement against one Company, from 0 to 1, with the reasons behind it. A Match belongs to a Company, never to a Procurement alone.
_Avoid_: rating, ranking, fit

### The vendor's record

**Company**:
The software vendor a Business Development Officer works for, identified by its Thai registered name and, when given, its TIN. A Procurement is scored against it. A Site Administrator never belongs to one.
_Avoid_: vendor, firm, organisation, account, tenant

**Company Manager**:
A Business Development Officer who approves requests to join their Company. The officer who creates a Company is its first manager, and a Company with members always keeps at least one. This is a standing inside one Company, not a third role.
_Avoid_: company admin, owner

**TIN**:
เลขประจำตัวผู้เสียภาษีอากร, the 13-digit number that identifies a Thai juristic person. It is optional and recorded, not relied on.
_Avoid_: tax ID, registration number

**Client**:
An organisation a Company has delivered work for. A Client has no account and never signs in.
_Avoid_: customer, buyer, agency

**Experience**:
One piece of work a Company delivered for a Client, described in the same terms a TOR is read into (platforms, tech stack, duration), so a past job and a tender can be compared.
_Avoid_: Project, past project, portfolio item, case study

### People

**Business Development Officer**:
The person deciding whether a Procurement is worth days of bid preparation. Every self-registration creates one.
_Avoid_: user, BD, salesperson

**Site Administrator**:
The person who runs and monitors Runs, reviews failures, and manages accounts. The role is granted, never self-claimed, and holds no Company. The system always keeps at least one.
_Avoid_: admin user, superuser, operator
