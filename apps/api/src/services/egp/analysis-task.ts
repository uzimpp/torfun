import type { ArchiveDocument, Procurement, SoftwareJudgement, TorAnalysis } from '@torfun/types';
import type { DocumentClassification, ReadMode } from '../vertex/classify-document';
import { decideDeadline } from './deadline';
import { decideOutcome } from './decision';
import { assignDocumentRoles, type ClassifiedDocument } from './document-roles';
import type { InvitationResult } from './invitation';
import { withDeadline, type Handoff, type RecordWork } from './record-work';
import type { TimelinePatch } from './timeline';
import { buildTombstone } from './tombstone';
import type { ExtractionResult } from './tor-package';

/**
 * Analysis: what happens to an Archive once Retrieval has it in hand. The model
 * reads it and the outcome is stored, as a task of its own beside the gate. It
 * never touches the site.
 */

/** The model's reading, as the Run offers it: every call already inside the Run's limit. */
export interface AnalysisDeps {
  extractTorPdfs: (archive: Uint8Array) => ExtractionResult;
  classifyDocument: (pdf: Buffer) => Promise<DocumentClassification>;
  readInvitation: (archive: Uint8Array, projectId: string) => Promise<InvitationResult>;
}

interface AnalysedArchive {
  documents: ArchiveDocument[];
  analysis: TorAnalysis | null;
  /** What the model concluded about the main TOR's work; null exactly when `analysis` is. */
  judgement: SoftwareJudgement | null;
  /** How the main TOR was read; only a whole-PDF reading may act on its own. */
  readMode: ReadMode | undefined;
  torAmbiguous: boolean;
  /** True where at least one candidate could not be read at all. */
  anyUnreadable: boolean;
}

/**
 * Classify every candidate PDF, then decide between them.
 *
 * One call per document (ADR-0003): with nothing stored, the bytes travel as
 * base64 and several in one request would breach the size limit. Only members
 * that matched a TOR filename pattern are sent — reading the rest of an archive
 * would cost tokens to be told what we already knew.
 */
async function analyseArchive(
  extraction: ExtractionResult,
  classifyDocument: AnalysisDeps['classifyDocument'],
): Promise<AnalysedArchive> {
  const byMember = new Map<string, DocumentClassification>();

  // All at once: the Run's limiter, inside `classifyDocument`, bounds the calls
  // across every archive. Gemini is not the upstream site, so the politeness
  // terms do not apply. Results come back in archive order, which
  // `assignDocumentRoles` relies on.
  const candidates = await Promise.all(
    extraction.torFiles.map(async (pdf): Promise<ClassifiedDocument> => {
      const classification = await classifyDocument(
        // A view over the extracted bytes, not a copy: a copy doubles every PDF in memory.
        Buffer.from(pdf.payload.buffer, pdf.payload.byteOffset, pdf.payload.byteLength),
      );
      byMember.set(pdf.member, classification);
      return {
        member: pdf.member,
        filename: pdf.filename,
        bytes: pdf.bytes,
        namePattern: pdf.namePattern,
        isTor: classification.isTor,
        torKind: classification.torKind,
        whatThisIs: classification.whatThisIs,
        unreadable: classification.unreadable,
        readMode: classification.readMode,
        readNote: classification.readNote,
      };
    }),
  );

  const { documents, mainTor, ambiguous } = assignDocumentRoles(candidates);

  return {
    documents,
    analysis: mainTor ? (byMember.get(mainTor.member)?.analysis ?? null) : null,
    judgement: mainTor ? (byMember.get(mainTor.member)?.judgement ?? null) : null,
    readMode: mainTor ? byMember.get(mainTor.member)?.readMode : undefined,
    torAmbiguous: ambiguous,
    anyUnreadable: candidates.some((candidate) => candidate.unreadable !== undefined),
  };
}

/**
 * A never-read project's Archive: its TOR read, the model's verdict decided, and
 * the outcome stored. `current` is the record with its timeline applied.
 */
export function readRetrievedArchive(
  deps: AnalysisDeps,
  work: RecordWork,
  fetched: { archive: Uint8Array; zipId: string; current: Procurement },
): Handoff {
  const { record, guard } = work;
  const { archive, zipId, current } = fetched;
  return async () => {
    work.stage = 'extract';
    const extraction = deps.extractTorPdfs(archive);
    work.count('archivesRetrieved');

    if (extraction.unsafeSkipped.length > 0) {
      // Never silently dropped: a path-traversal attempt in a government
      // archive is exactly the thing an administrator should see.
      await work.note(
        'extract',
        `Archive members rejected by the path-traversal guard: ${extraction.unsafeSkipped.join(', ')}`,
      );
    }

    // The record only counts as being read once there is something to read.
    if (extraction.torFiles.length > 0) {
      await work.store.transition(record.projectId, 'analysing');
    }

    work.stage = 'analysis';
    const analysed = await analyseArchive(extraction, deps.classifyDocument);
    if (guard.expired) return;

    // Note what is NOT here: extraction.torFiles carries the PDF payloads,
    // and they stop at this line. Only the manifest is persisted (ADR-0002).
    const patch: Partial<Procurement> = {
      zipId,
      documents: analysed.documents,
      analysis: analysed.analysis,
      torAmbiguous: analysed.torAmbiguous,
    };

    // The TOR was read either way. What the model's judgement may do is
    // decided in one place: only a confident, whole-document answer
    // shows or drops a record, and anything else is held for a person.
    const decision =
      analysed.analysis !== null && analysed.judgement !== null
        ? decideOutcome({ ...analysed.judgement, partialRead: analysed.readMode !== 'pdf' })
        : null;

    if (decision?.result !== 'drop') {
      // A dropped record keeps nothing, so its invitation is not worth a call.
      // Read even with no TOR: an administrator still sees the deadline.
      const invitation = await deps.readInvitation(archive, record.projectId);
      if (guard.expired) return;
      patch.documents = [...analysed.documents, ...invitation.documents];
      Object.assign(
        patch,
        decideDeadline(current, {
          priced: current.milestones.priced?.at ?? null,
          invitationBidAt: invitation.bidAt,
          torDeadline: analysed.analysis?.deadlineAt ?? null,
        }),
      );
    }

    if (analysed.analysis !== null && analysed.judgement !== null && decision) {
      if (decision.result === 'drop') {
        // Dropped: nothing read from the document is kept, only the
        // decision and the quote that made it.
        await work.store.tombstone(
          buildTombstone({
            projectId: record.projectId,
            reason: 'ai_not_software',
            evidence: analysed.judgement.reason,
            promptVersion: analysed.analysis.promptVersion,
            decidedBy: null,
            now: new Date(),
            record,
          }),
        );
        work.count('dropped');
      } else {
        await work.store.transition(
          record.projectId,
          decision.outcome,
          decision.result === 'held' ? { ...patch, holdReason: decision.holdReason } : patch,
        );
        if (decision.result === 'held') work.count('held');
        else work.count('torAnalysed');
      }
    } else if (analysed.anyUnreadable) {
      // The archive was retrieved; only the reading failed. Kept Completed, not
      // Queued, so a later Run does not download it again from a site that
      // asked not to be crawled; the failure log names what could not be read.
      await work.note(
        'analysis',
        `Archive retrieved but no candidate could be read: ${analysed.documents
          .filter((document) => document.role === 'unreadable')
          .map((document) => `${document.filename} (${document.note})`)
          .join('; ')}`,
      );
      await work.store.transition(record.projectId, 'analysis_failed', patch);
    } else {
      await work.note(
        'extract',
        `Archive downloaded (${extraction.members.length} members) but none of its documents is a TOR.`,
        'no_tor',
      );
      await work.store.transition(record.projectId, 'no_tor_in_archive', patch);
    }
  };
}

/**
 * A read project whose invitation moved: only the invitation is read again, and
 * stored with the timeline that moved it.
 */
export function readMovedInvitation(
  deps: AnalysisDeps,
  work: RecordWork,
  fetched: { archive: Uint8Array; timeline: TimelinePatch },
): Handoff {
  const { record, guard } = work;
  const { archive, timeline } = fetched;
  return async () => {
    work.stage = 'analysis';
    const invitation = await deps.readInvitation(archive, record.projectId);
    if (guard.expired) return;
    const reread = new Set(invitation.documents.map((document) => document.member));
    await work.store.amend(
      record.projectId,
      {
        ...timeline,
        documents: [
          ...record.documents.filter(
            (document) =>
              document.role !== 'invitation' &&
              document.role !== 'bidding_document' &&
              !reread.has(document.member),
          ),
          ...invitation.documents,
        ],
        ...decideDeadline(record, {
          priced: timeline.milestones.priced?.at ?? null,
          invitationBidAt: invitation.bidAt,
          torDeadline: record.analysis?.deadlineAt ?? null,
        }),
      },
      true,
    );
  };
}

/** The Run's Analysis tasks, one per fetched Archive. */
export interface AnalysisTasks {
  /**
   * Read a fetched Archive and store the outcome, as a task of its own, so
   * Retrieval does not wait for it.
   *
   * It has a deadline of its own, as long as a turn's: the model is not the
   * site, but a call that never answers must not hold the Run open for ever.
   * When that deadline wins, the record is failed as any late record is, while
   * its place in the waiting room is kept until the model's calls have really
   * settled: the Archive is still in memory until then.
   */
  start(work: RecordWork, fresh: boolean, handoff: Handoff): void;
  /** Resolves once every task, including any started meanwhile, has settled. */
  settled(): Promise<void>;
}

export function createAnalysisTasks(options: {
  deadlineMs: number;
  /** The live-view line the task's record moves to. */
  slot: () => number;
  /** Records why a record's work stopped. */
  fail: (work: RecordWork, fresh: boolean, error: unknown) => Promise<void>;
  /** An error that is not the record's (the store failing): the Run stops for it. */
  onError: (error: unknown) => void;
}): AnalysisTasks {
  const tasks = new Set<Promise<void>>();
  return {
    start(work, fresh, handoff) {
      const task = (async () => {
        work.moveTo(options.slot());
        const running = handoff();
        const leave = () => work.leaveRoom?.();
        void running.then(leave, leave);
        try {
          await withDeadline(() => running, options.deadlineMs, work.guard);
        } catch (error) {
          await options.fail(work, fresh, error);
        } finally {
          work.done();
        }
      })().catch(options.onError);
      tasks.add(task);
      void task.finally(() => tasks.delete(task));
    },
    async settled() {
      while (tasks.size > 0) await Promise.all([...tasks]);
    },
  };
}
