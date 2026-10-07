import type { IngestionFailure, Procurement } from '@torfun/types';
import type { FeedCursor } from '../../repositories/procurement.repository';
import { admit } from './admission';
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

/**
 * Stage 1 of the pipeline: e-GP's announcement feed, asked agency by agency and
 * day by day for e-bidding drafts and invitations (ADR-0018).
 *
 * The feed answers for one agency, one announcement type and one day at a time,
 * so a sweep is a grid of those, and the cursor remembers, per agency and type,
 * the range of days already read in full. A sweep asks about the days after that
 * range (and today, still filling), then a share of the year before it. Every
 * request goes to gprocurement.go.th, the site the downloads use, so each is
 * made through the SiteGate like theirs (`site`).
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
  /** Today as a Bangkok calendar day, `YYYY-MM-DD`. */
  today: string;
}

export interface DiscoveryResult {
  records: Procurement[];
  /** Feed items by a method other than e-bidding (the feed is filtered, so this should stay 0). Counted, not stored. */
  notEBidding: number;
  /** Items left out because they have a tombstone. Counted, not stored. */
  tombstoned: number;
  /** Agency-days where the feed listed fewer announcements than it said were made. Each is also a failure. */
  truncated: number;
  /** Where the cursor now stands, for the units this sweep moved; the caller stores it. */
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

/**
 * The Thai fiscal year (Buddhist era) a day falls in; it starts on 1 October.
 * The feed does not say which year's budget a tender spends, so this is the
 * year it was announced in, which is what it almost always is.
 */
export function fiscalYearOf(day: string): number {
  const [year, month] = day.split('-').map(Number) as [number, number];
  return year + 543 + (month >= 10 ? 1 : 0);
}

function now(): string {
  return new Date().toISOString();
}

function toRecord(agency: Unit['agency'], item: FeedItem, day: string): Procurement {
  const announcedOn = item.announcedOn ?? day;
  return queuedRecord(
    item.projectId,
    {
      projectName: item.title,
      // The feed is asked per agency, so the agency is the one asked about.
      deptName: agency.deptName,
      deptCode: agency.deptId,
      announceDate: convertDateToISO(announcedOn),
      budgetYear: fiscalYearOf(announcedOn),
      purchaseMethodName: item.methodName,
    },
    new Date(),
  );
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
 *     requests have been spent. The next sweep carries on where this one stopped.
 *
 * Within a day every unit is asked before the next day, so a refusal leaves the
 * agencies at about the same place. A range only ever grows by a contiguous day:
 * a unit whose day failed stops moving in that direction this sweep, and the
 * next sweep asks that day again. Today is never added to a range, because it is
 * still filling.
 *
 * Admission is the agency (the feed is asked per agency), the tender method and
 * the tombstone. The title is not consulted (ADR-0014).
 */
export async function discoverProjects(
  context: SweepContext,
  feed: AnnouncementFeed = createAnnouncementFeed(),
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

  const fail = (unit: Unit, day: string, error: string) =>
    failures.push({
      projectId: '-',
      projectName: `${unit.agency.deptName} / ${unit.type} / ${day}`,
      stage: 'discovery',
      kind: 'fault',
      error,
      at: now(),
    });

  /** Ask the feed about one unit's day and admit what it lists. False where the day could not be read. */
  const read = async (unit: Unit, day: string): Promise<boolean> => {
    let answer;
    try {
      answer = await context.site(() => feed.day(unit.agency.deptId, unit.type, day));
    } catch (error) {
      fail(unit, day, error instanceof Error ? error.message : String(error));
      if (error instanceof RateLimitedError) rateLimited = true;
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
    const ruledOut =
      answer.items.length > 0
        ? await context.tombstonedIds(answer.items.map((item) => item.projectId))
        : new Set<string>();

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
        case 'admit':
          // Seen as both a draft and an invitation, the invitation dates it; seen
          // twice as the same type (a re-announcement), the newer one does.
          const seen = byProjectId.get(item.projectId);
          const record = toRecord(unit.agency, item, day);
          if (
            !seen ||
            (unit.type === 'D0' && seen.type === 'B0') ||
            (unit.type === seen.type &&
              (record.announceDate ?? '') > (seen.record.announceDate ?? ''))
          ) {
            byProjectId.set(item.projectId, { record, type: unit.type });
          }
          break;
        case 'not_registry':
          // Cannot happen: the agency is the one asked about.
          break;
      }
    }
    return true;
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
      if (rateLimited) break newDays;
      if (!ok) {
        stalledNew.add(unit.key);
        continue;
      }
      const range = ranges[unit.key];
      if (day < today && range) {
        range.to = day;
        moved.add(unit.key);
      }
    }
  }

  // 2. History, newest first, within its share of the Run.
  const nextOld = (unit: Unit): string => {
    const range = ranges[unit.key];
    return range ? addDays(range.from, -1) : yesterday;
  };
  const stalledOld = new Set<string>();
  let spent = 0;
  history: for (let day = yesterday; day >= oldest && !rateLimited; day = addDays(day, -1)) {
    for (const unit of units) {
      if (stalledOld.has(unit.key) || day !== nextOld(unit)) continue;
      if (spent >= FEED_BACKFILL_REQUESTS_PER_RUN) break history;
      spent += 1;
      const ok = await read(unit, day);
      if (rateLimited) break history;
      if (!ok) {
        stalledOld.add(unit.key);
        continue;
      }
      const range = ranges[unit.key];
      if (range) range.from = day;
      else ranges[unit.key] = { from: day, to: day };
      moved.add(unit.key);
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
