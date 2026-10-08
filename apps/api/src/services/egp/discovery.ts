import type { IngestionFailure, Procurement } from '@torfun/types';
import type { FeedCursor } from '../../repositories/procurement.repository';
import { admit } from './admission';
import { createAnnouncementClient, type AnnouncementClient } from './announcement-client';
import { createAnnouncementFeed, type AnnouncementFeed, type FeedItem } from './announcement-feed';
import { RateLimitedError } from './client';
import {
  FEED_ANNOUNCEMENT_TYPES,
  FEED_BACKFILL_REQUESTS_PER_RUN,
  FEED_HISTORY_DAYS,
  FEED_REGISTRY,
  type FeedAnnouncementType,
} from './constants';
import { convertDateToISO } from './dates';
import { queuedRecord } from './feed-record';
import { detailOf, readProjectDetail, type DetailFields } from './project-detail';

/**
 * Stage 1 of the pipeline: e-GP's announcement feed, asked agency by agency and
 * day by day for e-bidding drafts and invitations (ADR-0018).
 *
 * The feed answers for one agency, one announcement type and one day at a time,
 * so a sweep is a grid of those, and the cursor remembers, per agency and type,
 * the range of days already read in full. A sweep asks about the days after that
 * range (and today, still filling), then a share of the year before it. A
 * project not stored yet has its detail read before it is kept, because the
 * feed does not say which year's budget it spends (ADR-0019). Every request
 * goes to gprocurement.go.th, the site the downloads use, so each is made
 * through the SiteGate like theirs (`site`).
 */

/** Which of these project ids have a tombstone. */
export type TombstoneLookup = (projectIds: string[]) => Promise<Set<string>>;

export interface SweepContext {
  /**
   * Make one request to the site: inside a gate hold, with the politeness pause
   * after it. A refusal latches the gate on its way out.
   */
  site: <T>(call: () => Promise<T>) => Promise<T>;
  /** The days already read in full, per agency and announcement type; see `cursorKey`. */
  cursor: FeedCursor;
  tombstonedIds: TombstoneLookup;
  /** The records already stored for these project ids; their detail is not read again. */
  storedRecords: (projectIds: string[]) => Promise<Procurement[]>;
  /** Today as a Bangkok calendar day, `YYYY-MM-DD`. */
  today: string;
  /**
   * Store what one agency-day added, as soon as it is read, so the queue fills
   * while the sweep goes on and a Run that stops early keeps what it found.
   */
  save: (batch: SweepBatch) => Promise<void>;
}

/** What one agency-day of the sweep added: records, failures, and the unit's new range. */
export interface SweepBatch {
  records: Procurement[];
  failures: IngestionFailure[];
  cursor: FeedCursor;
}

export interface DiscoveryResult {
  records: Procurement[];
  /** Feed items by a method other than e-bidding (the feed is filtered, so this should stay 0). Counted, not stored. */
  notEBidding: number;
  /** Items left out because they have a tombstone. Counted, not stored. */
  tombstoned: number;
  /** Agency-days where the feed listed fewer announcements than it said were made. Each is also a failure. */
  truncated: number;
  /** Where the cursor now stands, for the units this sweep moved; already given to `save`. */
  cursor: FeedCursor;
  failures: IngestionFailure[];
  /**
   * The site refused (429/403) and the sweep stopped there. What was found before
   * that is kept, and the cursor covers exactly the days read in full. The caller
   * stops the Run: it is the same site the downloads would ask next.
   */
  rateLimited: boolean;
  ranAt: string;
}

/** One cell of the sweep's grid: an agency's announcements of one type. */
interface Unit {
  key: string;
  agency: (typeof FEED_REGISTRY)[number];
  type: FeedAnnouncementType;
}

export function cursorKey(deptId: string, type: FeedAnnouncementType): string {
  return `${deptId}:${type}`;
}

/** `YYYY-MM-DD` shifted by whole days. */
export function addDays(day: string, days: number): string {
  const date = new Date(`${day}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Today in Bangkok, `YYYY-MM-DD`: the calendar the feed files announcements under. */
export function bangkokToday(nowMs: number = Date.now()): string {
  return new Date(nowMs + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function now(): string {
  return new Date().toISOString();
}

function toRecord(
  agency: Unit['agency'],
  item: FeedItem,
  day: string,
  detail: DetailFields,
): Procurement {
  return {
    ...queuedRecord(
      item.projectId,
      {
        projectName: item.title,
        // The feed is asked per agency, so the agency is the one asked about.
        deptName: agency.deptName,
        deptCode: agency.deptId,
        announceDate: convertDateToISO(item.announcedOn ?? day),
        budgetYear: detail.budgetYear,
        purchaseMethodName: item.methodName,
      },
      new Date(),
    ),
    ...detail,
  };
}

/**
 * Sweep the feed for every registry agency and announcement type.
 *
 * Two passes, in this order, so the newest tenders arrive first however much
 * history is still unread:
 *
 *  1. New days: from the day after each unit's range up to today, oldest first.
 *     A unit never read asks only about today here; history covers the rest.
 *  2. History: from the day before each unit's range back towards
 *     `FEED_HISTORY_DAYS` ago, newest first, until `FEED_BACKFILL_REQUESTS_PER_RUN`
 *     requests (feed and detail alike) have been spent. The next sweep carries
 *     on where this one stopped.
 *
 * Within a day every unit is asked before the next day, so a refusal leaves the
 * agencies at about the same place. A range only ever grows by a contiguous day:
 * a unit whose day failed stops moving in that direction this sweep, and the
 * next sweep asks that day again. A day where a new project's detail could not
 * be read counts as failed too, so that project is found again. Today is never
 * added to a range, because it is still filling.
 *
 * Admission is the agency (the feed is asked per agency), the tender method and
 * the tombstone. The title is not consulted (ADR-0014).
 */
export async function discoverProjects(
  context: SweepContext,
  feed: AnnouncementFeed = createAnnouncementFeed(),
  announcements: AnnouncementClient = createAnnouncementClient(),
): Promise<DiscoveryResult> {
  const { today } = context;
  const yesterday = addDays(today, -1);
  const oldest = addDays(today, -(FEED_HISTORY_DAYS - 1));

  const failures: IngestionFailure[] = [];
  /** What each admitted project will be stored as, and which announcement type dated it. */
  const byProjectId = new Map<string, { record: Procurement; type: FeedAnnouncementType }>();
  const notEBidding = new Set<string>();
  const tombstoned = new Set<string>();
  let truncated = 0;
  let rateLimited = false;
  /** Requests made so far, so history can be held to its share. */
  let requests = 0;
  const site: SweepContext['site'] = (call) => {
    requests += 1;
    return context.site(call);
  };

  const units: Unit[] = FEED_REGISTRY.flatMap((agency) =>
    FEED_ANNOUNCEMENT_TYPES.map((type) => ({ key: cursorKey(agency.deptId, type), agency, type })),
  );

  // The working ranges. One that ends before the history window is too old to
  // extend without a gap, so it is started again.
  const ranges: FeedCursor = {};
  for (const unit of units) {
    const range = context.cursor[unit.key];
    if (range && range.to >= addDays(oldest, -1)) ranges[unit.key] = { ...range };
  }
  const moved = new Set<string>();

  // What `save` has not been given yet.
  const unsaved = new Set<string>();
  let savedFailures = 0;
  const save = async (unit: Unit) => {
    const range = ranges[unit.key];
    await context.save({
      records: [...unsaved].map((id) => byProjectId.get(id)!.record),
      failures: failures.slice(savedFailures),
      cursor: range && moved.has(unit.key) ? { [unit.key]: range } : {},
    });
    unsaved.clear();
    savedFailures = failures.length;
  };

  const log = (projectId: string, projectName: string, error: string) =>
    failures.push({ projectId, projectName, stage: 'discovery', kind: 'fault', error, at: now() });
  const fail = (unit: Unit, day: string, error: string) =>
    log('-', `${unit.agency.deptName} / ${unit.type} / ${day}`, error);
  const failWith = (unit: Unit, day: string, error: unknown) => {
    fail(unit, day, error instanceof Error ? error.message : String(error));
    if (error instanceof RateLimitedError) rateLimited = true;
  };

  /** A new project's detail, or null where it could not be read (logged). */
  const readDetail = async (unit: Unit, day: string, item: FeedItem) => {
    try {
      const result = await site(() => readProjectDetail(announcements, item.projectId));
      if ('fields' in result) return result.fields;
      log(
        item.projectId,
        item.title,
        `Not stored, and ${unit.type} / ${day} will be read again next Run: ${result.error}`,
      );
    } catch (error) {
      failWith(unit, day, error);
    }
    return null;
  };

  /** Ask the feed about one unit's day and admit what it lists. False where the day could not be read. */
  const read = async (unit: Unit, day: string): Promise<boolean> => {
    let answer;
    try {
      answer = await site(() => feed.day(unit.agency.deptId, unit.type, day));
    } catch (error) {
      failWith(unit, day, error);
      return false;
    }

    const listed = answer.items.length + answer.withoutId;
    if (answer.announced > listed) {
      // Asking again gives the same twenty, so the day still counts as read.
      truncated += 1;
      fail(
        unit,
        day,
        `The feed listed ${listed} of the ${answer.announced} announcements made that day; the rest cannot be reached through it.`,
      );
    }
    if (answer.withoutId > 0) {
      fail(unit, day, `${answer.withoutId} feed item(s) carried no project id and were skipped.`);
    }

    const registry = new Set([unit.agency.deptName]);
    const ids = answer.items.map((item) => item.projectId);
    const ruledOut = ids.length > 0 ? await context.tombstonedIds(ids) : new Set<string>();
    const stored = new Map(
      (ids.length > 0 ? await context.storedRecords(ids) : []).map((record) => [
        record.projectId,
        detailOf(record),
      ]),
    );
    let complete = true;

    for (const item of answer.items) {
      const row = {
        projectId: item.projectId,
        deptName: unit.agency.deptName,
        purchaseMethodName: item.methodName,
      };
      switch (admit(row, registry, ruledOut)) {
        case 'not_e_bidding':
          notEBidding.add(item.projectId);
          break;
        case 'tombstoned':
          tombstoned.add(item.projectId);
          break;
        case 'admit': {
          const seen = byProjectId.get(item.projectId);
          const detail = seen
            ? detailOf(seen.record)
            : (stored.get(item.projectId) ?? (await readDetail(unit, day, item)));
          if (detail === null) {
            if (rateLimited) return false;
            complete = false;
            break;
          }
          const record = toRecord(unit.agency, item, day, detail);
          // Seen as both a draft and an invitation, the invitation dates it; seen
          // twice as the same type (a re-announcement), the newer one does.
          if (
            !seen ||
            (unit.type === 'D0' && seen.type === 'B0') ||
            (unit.type === seen.type &&
              (record.announceDate ?? '') > (seen.record.announceDate ?? ''))
          ) {
            byProjectId.set(item.projectId, { record, type: unit.type });
            unsaved.add(item.projectId);
          }
          break;
        }
        case 'not_registry':
          // Cannot happen: the agency is the one asked about.
          break;
      }
    }
    return complete;
  };

  // 1. New days, oldest first.
  const nextNew = (unit: Unit): string => {
    const range = ranges[unit.key];
    return range ? addDays(range.to, 1) : today;
  };
  const stalledNew = new Set<string>();
  const firstNew = units.map(nextNew).reduce((a, b) => (a < b ? a : b), today);
  newDays: for (let day = firstNew; day <= today; day = addDays(day, 1)) {
    for (const unit of units) {
      if (stalledNew.has(unit.key) || day < nextNew(unit)) continue;
      const ok = await read(unit, day);
      const range = ranges[unit.key];
      if (ok && day < today && range) {
        range.to = day;
        moved.add(unit.key);
      }
      await save(unit);
      if (rateLimited) break newDays;
      if (!ok) stalledNew.add(unit.key);
    }
  }

  // 2. History, newest first, within its share of the Run.
  const nextOld = (unit: Unit): string => {
    const range = ranges[unit.key];
    return range ? addDays(range.from, -1) : yesterday;
  };
  const stalledOld = new Set<string>();
  const historyStart = requests;
  history: for (let day = yesterday; day >= oldest && !rateLimited; day = addDays(day, -1)) {
    for (const unit of units) {
      if (stalledOld.has(unit.key) || day !== nextOld(unit)) continue;
      // Checked before each day, not each request: a day begun is finished, so
      // its new projects can take the share a little past the limit.
      if (requests - historyStart >= FEED_BACKFILL_REQUESTS_PER_RUN) break history;
      const ok = await read(unit, day);
      if (ok) {
        const range = ranges[unit.key];
        if (range) range.from = day;
        else ranges[unit.key] = { from: day, to: day };
        moved.add(unit.key);
      }
      await save(unit);
      if (rateLimited) break history;
      if (!ok) stalledOld.add(unit.key);
    }
  }

  return {
    records: [...byProjectId.values()].map((admitted) => admitted.record),
    notEBidding: notEBidding.size,
    tombstoned: tombstoned.size,
    truncated,
    cursor: Object.fromEntries([...moved].map((key) => [key, ranges[key]!])),
    failures,
    rateLimited,
    ranAt: now(),
  };
}
