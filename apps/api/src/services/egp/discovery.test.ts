import { describe, expect, test } from 'bun:test';
import type { FeedCursor } from '../../repositories/procurement.repository';
import type { AnnouncementFeed, FeedDay, FeedItem } from './announcement-feed';
import { RateLimitedError, UpstreamError } from './client';
import {
  E_BIDDING_METHOD,
  FEED_BACKFILL_REQUESTS_PER_RUN,
  FEED_REGISTRY,
  type FeedAnnouncementType,
} from './constants';
import { addDays, bangkokToday, cursorKey, discoverProjects, fiscalYearOf } from './discovery';

const TODAY = '2026-10-07';
const CUSTOMS = '0305';
const UNITS = FEED_REGISTRY.flatMap((agency) =>
  (['B0', 'D0'] as const).map((type) => cursorKey(agency.deptId, type)),
);

interface Ask {
  deptId: string;
  type: FeedAnnouncementType;
  day: string;
}

/**
 * A feed that answers from a table keyed `deptId:type:day`; anything not in it
 * is a day with nothing announced. An Error in the table is thrown.
 */
function fakeFeed(answers: Record<string, FeedDay | Error> = {}) {
  const asked: Ask[] = [];
  const feed: AnnouncementFeed = {
    async day(deptId, type, day) {
      asked.push({ deptId, type, day });
      const answer = answers[`${deptId}:${type}:${day}`];
      if (answer instanceof Error) throw answer;
      return answer ?? { announced: 0, items: [], withoutId: 0 };
    },
  };
  return { feed, asked };
}

function item(projectId: string, overrides: Partial<FeedItem> = {}): FeedItem {
  return {
    projectId,
    title: 'ประกวดราคาจ้างพัฒนาระบบ',
    methodName: E_BIDDING_METHOD,
    announcementName: 'ประกาศเชิญชวน',
    announcedOn: null,
    ...overrides,
  };
}

const listing = (items: FeedItem[], extra: Partial<FeedDay> = {}): FeedDay => ({
  announced: items.length,
  items,
  withoutId: 0,
  ...extra,
});

/** Every unit's range set to the same days. */
const everyUnit = (range: { from: string; to: string }): FeedCursor =>
  Object.fromEntries(UNITS.map((key) => [key, { ...range }]));

/** Every unit read in full through yesterday, so nothing but today is left. */
const caughtUp = () => everyUnit({ from: addDays(TODAY, -364), to: addDays(TODAY, -1) });

function sweep(feed: AnnouncementFeed, cursor: FeedCursor = {}, tombstoned: string[] = []) {
  return discoverProjects(
    {
      site: (call) => call(),
      cursor,
      tombstonedIds: async (ids) => new Set(ids.filter((id) => tombstoned.includes(id))),
      today: TODAY,
    },
    feed,
  );
}

describe('discoverProjects: which days it asks about', () => {
  test('a feed read up to yesterday asks only about today, and records nothing new', async () => {
    const { feed, asked } = fakeFeed();

    const result = await sweep(feed, caughtUp());

    expect(asked).toHaveLength(UNITS.length);
    expect(asked.every((ask) => ask.day === TODAY)).toBe(true);
    // Today is still filling, so it is never added to a range.
    expect(result.cursor).toEqual({});
  });

  test('new days are asked before history, oldest new day first', async () => {
    const { feed, asked } = fakeFeed();

    const result = await sweep(feed, everyUnit({ from: '2026-09-27', to: '2026-10-04' }));

    const days = asked.map((ask) => ask.day);
    const firstHistory = days.findIndex((day) => day < '2026-09-27');
    expect(days.slice(0, firstHistory)).toEqual([
      ...Array(UNITS.length).fill('2026-10-05'),
      ...Array(UNITS.length).fill('2026-10-06'),
      ...Array(UNITS.length).fill('2026-10-07'),
    ]);
    expect(days[firstHistory]).toBe('2026-09-26');
    // The new days end at yesterday; today is not recorded.
    expect(result.cursor[cursorKey(CUSTOMS, 'B0')]?.to).toBe('2026-10-06');
  });

  test('history is read newest first and stops at its share of the Run', async () => {
    const { feed, asked } = fakeFeed();

    const result = await sweep(feed);

    // A first sweep: today for every unit, then 60 history requests, which is
    // six days back for ten units.
    expect(FEED_BACKFILL_REQUESTS_PER_RUN).toBe(60);
    expect(asked).toHaveLength(UNITS.length + 60);
    const history = asked.slice(UNITS.length).map((ask) => ask.day);
    expect(history[0]).toBe('2026-10-06');
    expect(history.at(-1)).toBe('2026-10-01');
    expect(result.cursor[cursorKey(CUSTOMS, 'D0')]).toEqual({
      from: '2026-10-01',
      to: '2026-10-06',
    });
  });

  test('the next sweep carries history on from where the last one stopped', async () => {
    const { feed, asked } = fakeFeed();
    const cursor = everyUnit({ from: '2026-10-01', to: '2026-10-06' });

    const result = await sweep(feed, cursor);

    const history = asked.slice(UNITS.length).map((ask) => ask.day);
    expect(history[0]).toBe('2026-09-30');
    expect(history.at(-1)).toBe('2026-09-25');
    expect(result.cursor[cursorKey(CUSTOMS, 'B0')]).toEqual({
      from: '2026-09-25',
      to: '2026-10-06',
    });
  });

  test('a day that fails stalls only its own unit, which asks that day again next time', async () => {
    const stuck = cursorKey(CUSTOMS, 'B0');
    const { feed, asked } = fakeFeed({
      [`${CUSTOMS}:B0:2026-10-05`]: new UpstreamError(
        'The announcement feed answered with something other than RSS.',
      ),
    });
    const cursor = everyUnit({ from: addDays(TODAY, -364), to: '2026-10-04' });

    const result = await sweep(feed, cursor);

    const customsDraftDays = asked
      .filter((ask) => ask.deptId === CUSTOMS && ask.type === 'B0')
      .map((ask) => ask.day);
    expect(customsDraftDays).toEqual(['2026-10-05']);
    expect(result.cursor[stuck]).toBeUndefined();
    expect(result.cursor[cursorKey(CUSTOMS, 'D0')]?.to).toBe('2026-10-06');
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0]).toMatchObject({
      stage: 'discovery',
      projectName: expect.stringContaining('B0 / 2026-10-05'),
      error: expect.stringContaining('other than RSS'),
    });
    expect(result.rateLimited).toBe(false);
  });

  test('a range that ends before the year window is started again from today', async () => {
    const restarted = cursorKey(CUSTOMS, 'D0');
    const { feed, asked } = fakeFeed();
    const cursor = { ...caughtUp(), [restarted]: { from: '2025-01-01', to: '2025-03-01' } };

    const result = await sweep(feed, cursor);

    expect(asked.some((ask) => ask.day <= '2025-03-02')).toBe(false);
    // Only this unit has history left, so the whole share goes to it.
    expect(result.cursor).toEqual({ [restarted]: { from: '2026-08-08', to: '2026-10-06' } });
  });

  test('a refusal stops the sweep at once and keeps the days read before it', async () => {
    const { feed, asked } = fakeFeed({
      [`${CUSTOMS}:D0:2026-10-06`]: new RateLimitedError('http://process3', 429),
    });
    const cursor = everyUnit({ from: addDays(TODAY, -364), to: '2026-10-05' });

    const result = await sweep(feed, cursor);

    expect(result.rateLimited).toBe(true);
    expect(asked.at(-1)).toEqual({ deptId: CUSTOMS, type: 'D0', day: '2026-10-06' });
    expect(result.cursor).toEqual({
      [cursorKey(CUSTOMS, 'B0')]: { from: addDays(TODAY, -364), to: '2026-10-06' },
    });
  });
});

describe('discoverProjects: what it admits', () => {
  test('an e-bidding item becomes a Queued record dated by its announcement', async () => {
    const { feed } = fakeFeed({
      [`${CUSTOMS}:D0:${TODAY}`]: listing([item('69109044981', { announcedOn: '2026-10-07' })]),
    });

    const result = await sweep(feed, caughtUp());

    expect(result.records).toHaveLength(1);
    expect(result.records[0]).toMatchObject({
      projectId: '69109044981',
      deptName: 'กรมศุลกากร',
      deptCode: CUSTOMS,
      budgetYear: 2570,
      state: 'Queued',
      status: 'unknown',
      projectMoney: null,
    });
    expect(result.records[0]!.announceDate).toStartWith('2026-10-07');
  });

  test('a project seen as both a draft and an invitation keeps the invitation date', async () => {
    const { feed } = fakeFeed({
      // History reads newest first, so the invitation is met before the draft.
      [`${CUSTOMS}:D0:2026-10-04`]: listing([item('69109044981', { announcedOn: '2026-10-04' })]),
      [`${CUSTOMS}:B0:2026-10-02`]: listing([item('69109044981', { announcedOn: '2026-10-02' })]),
      // On the same day the draft is asked first, and the invitation still wins.
      [`${CUSTOMS}:B0:2026-10-03`]: listing([item('69109044982', { announcedOn: '2026-10-03' })]),
      [`${CUSTOMS}:D0:2026-10-03`]: listing([item('69109044982', { announcedOn: '2026-09-30' })]),
    });

    const result = await sweep(feed);

    const byId = new Map(result.records.map((record) => [record.projectId, record]));
    expect(byId.get('69109044981')?.announceDate).toStartWith('2026-10-04');
    expect(byId.get('69109044982')?.announceDate).toStartWith('2026-09-30');
    expect(result.records).toHaveLength(2);
  });

  test('an invitation announced again keeps its newest date, whichever day is read first', async () => {
    const { feed } = fakeFeed({
      // New days are read before history, so the newer invitation is met first.
      [`${CUSTOMS}:D0:${TODAY}`]: listing([item('69109044981', { announcedOn: TODAY })]),
      [`${CUSTOMS}:D0:2026-10-03`]: listing([item('69109044981', { announcedOn: '2026-10-03' })]),
    });

    const result = await sweep(feed);

    expect(result.records).toHaveLength(1);
    expect(result.records[0]!.announceDate).toStartWith(TODAY);
  });

  test('a day the feed cut short, and items with no project id, are logged as failures', async () => {
    const twenty = Array.from({ length: 20 }, (_, n) =>
      item(`691090450${String(n).padStart(2, '0')}`),
    );
    const { feed } = fakeFeed({
      [`${CUSTOMS}:D0:${TODAY}`]: listing(twenty, { announced: 27 }),
      [`${CUSTOMS}:B0:${TODAY}`]: listing([item('69109044981')], { announced: 3, withoutId: 2 }),
    });

    const result = await sweep(feed, caughtUp());

    expect(result.truncated).toBe(1);
    expect(result.records).toHaveLength(21);
    expect(result.failures.map((failure) => failure.error)).toEqual([
      '2 feed item(s) carried no project id and were skipped.',
      'The feed listed 20 of the 27 announcements made that day; the rest cannot be reached through it.',
    ]);
    expect(result.failures.every((failure) => failure.stage === 'discovery')).toBe(true);
  });

  test('tombstoned and non-e-bidding items are counted, not kept', async () => {
    const { feed } = fakeFeed({
      [`${CUSTOMS}:D0:${TODAY}`]: listing([
        item('69109044981'),
        item('69109044982'),
        item('69109044983', { methodName: 'เฉพาะเจาะจง' }),
      ]),
    });

    const result = await sweep(feed, caughtUp(), ['69109044982']);

    expect(result.records.map((record) => record.projectId)).toEqual(['69109044981']);
    expect(result.tombstoned).toBe(1);
    expect(result.notEBidding).toBe(1);
  });
});

describe('the calendar the feed is read by', () => {
  test('today is the Bangkok date, seven hours ahead of UTC', () => {
    expect(bangkokToday(Date.parse('2026-10-06T16:59:59Z'))).toBe('2026-10-06');
    expect(bangkokToday(Date.parse('2026-10-06T17:00:00Z'))).toBe('2026-10-07');
  });

  test('the fiscal year starts on 1 October, in the Buddhist era', () => {
    expect(fiscalYearOf('2026-09-30')).toBe(2569);
    expect(fiscalYearOf('2026-10-01')).toBe(2570);
  });
});
