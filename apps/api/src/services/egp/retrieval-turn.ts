import type { Procurement } from '@torfun/types';
import { readMovedInvitation, readRetrievedArchive, type AnalysisDeps } from './analysis-task';
import type { AnnouncementClient, DraftListParams } from './announcement-client';
import { admitByProcurementDetail } from './detail-turn';
import type { Handoff, RecordWork } from './record-work';
import type { RetrievalQueue } from './retrieval-queue';
import { reviewTimeline, type TimelineReview } from './timeline';

/**
 * Retrieval: one project's turn at the gate. Its timeline, then the archive
 * lookup and download where there is an Archive to fetch, all in one gate hold.
 * What it fetched is handed back for Analysis.
 */

export interface RetrievalDeps {
  announcements: AnnouncementClient;
  /** `signal` is aborted at the record's deadline, which cancels the site request. */
  resolveZipId: (projectId: string, signal?: AbortSignal) => Promise<string | null>;
  downloadArchive: (zipId: string, signal?: AbortSignal) => Promise<Uint8Array>;
  /** How a fetched Archive is read, once the turn is over. */
  analysis: AnalysisDeps;
  /** Where a refresh that needs a waiting-room place gets one, or waits for one. */
  queue: Pick<RetrievalQueue, 'takePlace' | 'putBack'>;
}

/**
 * One project's turn, up to the end of its last site request. Returns its
 * Analysis where an Archive was fetched; undefined where the turn was all
 * there was, or its time ran out.
 */
export async function takeTurn(
  deps: RetrievalDeps,
  work: RecordWork,
  fresh: boolean,
): Promise<Handoff | undefined> {
  return fresh ? retrieve(deps, work) : refresh(deps, work);
}

/**
 * The project's timeline, with any code not seen before logged. Null where
 * there is nothing to go on: e-GP gave none, or the record's time ran out
 * (the caller tells the two apart by `guard.expired`).
 */
async function readTimeline(deps: RetrievalDeps, work: RecordWork): Promise<TimelineReview | null> {
  const { record, guard } = work;
  const rows = await work.site(() =>
    deps.announcements.timeline(record.projectId, guard.controller.signal),
  );
  if (guard.expired) return null;
  if (rows === null) {
    // "Unavailable" is not "no announcements": the project keeps what it had.
    await work.note(
      'timeline',
      'e-GP gave no announcement timeline for this project (data: null).',
    );
    return null;
  }
  const review = reviewTimeline(record.timeline, rows, new Date().toISOString());
  for (const unknown of review.unrecognised) {
    await work.note(
      'timeline',
      `Unrecognised announcement code "${unknown.announceType}" (${unknown.announceDate ?? 'no date'}); the status was not changed by it.`,
    );
  }
  return review;
}

async function readCommentsCloseAt(
  deps: RetrievalDeps,
  work: RecordWork,
  draftParams: () => Promise<DraftListParams | null>,
): Promise<string | null> {
  const { record, guard } = work;
  const params = await draftParams();
  if (guard.expired || !params) return record.timeline.commentsCloseAt;
  const closes = await work.site(() =>
    deps.announcements.commentsCloseAt(record.projectId, params, guard.controller.signal),
  );
  return closes ?? record.timeline.commentsCloseAt;
}

async function refresh(deps: RetrievalDeps, work: RecordWork): Promise<Handoff | undefined> {
  let draftParams = async () =>
    (
      await work.site(() =>
        deps.announcements.procurementDetail(work.record.projectId, work.guard.controller.signal),
      )
    )?.draftListParams ?? null;
  if (work.record.detailReadAt === null) {
    work.stage = 'discovery';
    const reading = await admitByProcurementDetail(deps.announcements, work);
    if (reading.kind === 'expired') return;
    if (reading.kind === 'out_of_scope') {
      work.endSiteSection();
      return;
    }
    const params = reading.kind === 'in_scope' ? reading.params : null;
    draftParams = async () => params;
    if (reading.kind === 'in_scope') {
      await work.store.amend(work.record.projectId, reading.patch, true);
      work.record = { ...work.record, ...reading.patch };
    }
    work.stage = 'timeline';
  }
  const { record } = work;
  let review = await readTimeline(deps, work);
  if (work.guard.expired) return;
  if (review === null) {
    work.endSiteSection();
    return;
  }
  if (review.timeline.status === 'drafting') {
    const commentsCloseAt = await readCommentsCloseAt(deps, work, draftParams);
    if (work.guard.expired) return;
    review = {
      ...review,
      timeline: { ...review.timeline, commentsCloseAt },
      changed: review.changed || commentsCloseAt !== record.timeline.commentsCloseAt,
    };
  }

  if (!review.invitationMoved) {
    work.count('refreshed');
    // A read that found nothing new is not news: only its time is kept.
    const timeline = review.changed
      ? review.timeline
      : { ...record.timeline, lastReadAt: review.timeline.lastReadAt };
    await work.store.amend(record.projectId, { timeline }, review.changed);
    work.endSiteSection();
    return;
  }

  // The invitation moved, so the archive is fetched, and an Archive needs a
  // place in the waiting room. This turn holds the gate, so it never waits for
  // one: the room could be full of records waiting for this very gate. It
  // takes a place only if one is free now. If none is, the project goes to the
  // back of the queue to take a place before its next turn, and is left
  // untouched meanwhile, so a Run that ends first leaves it due for the next.
  if (!work.leaveRoom) {
    const place = deps.queue.takePlace();
    if (!place) {
      // Queued before the gate is freed, so the pause after this turn is kept.
      deps.queue.putBack({ record, fresh: false, withPlace: true });
      work.endSiteSection();
      return;
    }
    work.leaveRoom = place;
  }
  work.count('refreshed');
  // The moved date is kept back until the invitation it dates has been re-read,
  // or a failed re-read would leave it looking already done.
  await work.store.amend(
    record.projectId,
    { timeline: { ...record.timeline, lastReadAt: review.timeline.lastReadAt } },
    false,
  );

  // Fetch the archive again; Analysis reads only its invitation.
  const { guard } = work;
  work.stage = 'info';
  const zipId = await work.site(() => deps.resolveZipId(record.projectId, guard.controller.signal));
  if (guard.expired) return;
  if (zipId === null) {
    work.endSiteSection();
    await work.note(
      'info',
      'No zipId in the announcement response — the re-dated invitation was not re-read.',
    );
    return;
  }
  const archive = await download(deps, work, zipId);
  if (!archive) return;
  return readMovedInvitation(deps.analysis, work, { archive, zipId, timeline: review.timeline });
}

/** A project never read: its timeline, then its archive retrieved, to be read by Analysis. */
async function retrieve(deps: RetrievalDeps, work: RecordWork): Promise<Handoff | undefined> {
  const { record, guard } = work;
  const review = await readTimeline(deps, work);
  if (guard.expired) return;
  let current: Procurement = record;
  if (review !== null) {
    await work.store.amend(record.projectId, { timeline: review.timeline }, true);
    current = { ...record, timeline: review.timeline };
  }

  work.stage = 'info';
  const zipId = await work.site(() => deps.resolveZipId(record.projectId, guard.controller.signal));
  if (guard.expired) return;

  if (zipId === null) {
    // A real answer from upstream, not a transport error: this project
    // published no TOR package. Recorded as Failed because an admin is
    // left with nothing to read, but distinguished by its outcome.
    const error = 'No zipId in the announcement response — no TOR package published.';
    work.endSiteSection();
    await work.note('info', error, 'no_tor');
    await work.store.transition(record.projectId, 'no_tor_package', {}, error);
    work.count('failed');
    return;
  }
  const archive = await download(deps, work, zipId);
  if (!archive) return;
  return readRetrievedArchive(deps.analysis, work, { archive, zipId, current });
}

/** The download, the last of the turn; undefined where the record's time ran out. */
async function download(
  deps: RetrievalDeps,
  work: RecordWork,
  zipId: string,
): Promise<Uint8Array | undefined> {
  const { guard } = work;
  work.stage = 'download';
  const archive = await work.site(() => deps.downloadArchive(zipId, guard.controller.signal));
  if (guard.expired) return;
  work.endSiteSection();
  return archive;
}
