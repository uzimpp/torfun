import { describe, expect, test } from 'bun:test';
import {
  EMPTY_TIMELINE,
  type IngestionOutcome,
  type Procurement,
  type TorAnalysis,
} from '@torfun/types';
import { NotFoundError } from '../core/errors';
import { InMemoryProcurementStore } from '../testing/procurement-store';
import { isVisibleTo } from './audience';
import { TorService } from './tor.service';

// Fixtures only: invented projects. Dates are ISO, as Discovery stores them.
const TOR = 'tor';
const LATER = '2026-06-01T00:00:00.000Z';
const EARLIER = '2026-01-01T00:00:00.000Z';

const analysis = (techStack: string[]): TorAnalysis =>
  ({ summary: '', techStack }) as unknown as TorAnalysis;

function record(projectId: string, overrides: Partial<Procurement> = {}): Procurement {
  return {
    projectId,
    projectName: `โครงการ ${projectId}`,
    deptName: 'หน่วยงาน ก',
    deptSubName: null,
    deptCode: '1',
    budgetYear: 2569,
    typeId: '03',
    goodsId: '4010',
    detailReadAt: '2026-01-01T00:00:00.000Z',
    announceDate: EARLIER,
    purchaseMethodName: 'e-bidding',
    projectMoney: 1_000_000,
    priceBuild: null,
    state: 'Completed',
    outcome: 'tor_analysed',
    attempts: 0,
    holdReason: null,
    statusHistory: [],
    analysis: analysis(['React']),
    discoveredAt: '2026-01-01T00:00:00.000Z',
    timeline: { ...EMPTY_TIMELINE, status: 'awarded' },
    approved: null,
    archive: null,
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  } as Procurement;
}

async function build(records: Procurement[]) {
  const store = new InMemoryProcurementStore();
  for (const item of records) await store.upsert(item);
  return new TorService(store);
}

const tor = (overrides: Partial<Procurement> = {}) =>
  record(TOR, { announceDate: LATER, projectMoney: 1_000_000, ...overrides });

const ids = (group: { projects: { projectId: string }[] }) =>
  group.projects.map((project) => project.projectId).sort();

describe('budgetComparison: the three groups', () => {
  test('each group matches on its own criterion only', async () => {
    const service = await build([
      tor({ analysis: analysis(['React', 'Node']) }),
      record('same-all', { projectMoney: 1_100_000 }),
      record('other-agency', { deptName: 'หน่วยงาน ข', projectMoney: 1_200_000 }),
      record('other-category', { goodsId: '4016', projectMoney: 1_300_000 }),
      record('other-type', { typeId: '01', projectMoney: 1_350_000 }),
      record('other-tech', { analysis: analysis(['Java']), projectMoney: 1_400_000 }),
      record('no-analysis', { analysis: null, projectMoney: 1_500_000 }),
    ]);

    const { groups, budget } = await service.budgetComparison(TOR, 'officer');
    const by = Object.fromEntries(groups.map((group) => [group.basis, group]));

    expect(budget).toBe(1_000_000);
    expect(by.category!.criterion).toBe('4010/03');
    expect(ids(by.category!)).toEqual(['no-analysis', 'other-agency', 'other-tech', 'same-all']);
    expect(by.agency!.criterion).toBe('หน่วยงาน ก');
    expect(ids(by.agency!)).toEqual([
      'no-analysis',
      'other-category',
      'other-tech',
      'other-type',
      'same-all',
    ]);
    expect(by.tech!.criterion).toBe('React, Node');
    expect(ids(by.tech!)).toEqual(['other-agency', 'other-category', 'other-type', 'same-all']);
  });

  test('technologies match ignoring case and outer spaces, and need only one in common', async () => {
    const service = await build([
      tor({ analysis: analysis(['React', 'Node.js']) }),
      record('case', { analysis: analysis([' react ']) }),
      record('second', { analysis: analysis(['Go', 'NODE.JS']) }),
      record('partial', { analysis: analysis(['Reactive']) }),
    ]);

    const tech = (await service.budgetComparison(TOR, 'officer')).groups.find(
      (group) => group.basis === 'tech',
    )!;
    expect(ids(tech)).toEqual(['case', 'second']);
  });

  test('a group whose data this TOR lacks has no criterion and no comparables', async () => {
    const service = await build([tor({ goodsId: null, analysis: null }), record('a'), record('b')]);

    const { groups } = await service.budgetComparison(TOR, 'officer');
    const by = Object.fromEntries(groups.map((group) => [group.basis, group]));
    expect(by.category).toMatchObject({ criterion: null, count: 0, summary: null, projects: [] });
    expect(by.tech).toMatchObject({ criterion: null, count: 0, summary: null, projects: [] });
    expect(by.agency).toMatchObject({ criterion: 'หน่วยงาน ก', count: 2 });
  });

  test('a TOR with no planned budget cannot be compared', async () => {
    const service = await build([tor({ projectMoney: null }), record('a')]);

    expect(await service.budgetComparison(TOR, 'officer')).toEqual({
      minSample: 5,
      budget: null,
      groups: [],
    });
  });
});

describe('budgetComparison: which projects are comparable', () => {
  test('only earlier, dated projects count; itself, same-day and later ones do not', async () => {
    const service = await build([
      tor(),
      record('earlier', { announceDate: EARLIER }),
      record('same-day', { announceDate: LATER }),
      record('later', { announceDate: '2026-09-01T00:00:00.000Z' }),
      record('undated', { announceDate: null }),
      record('unreadable', { announceDate: '1 ตุลาคม 2569' }),
    ]);

    const agency = (await service.budgetComparison(TOR, 'officer')).groups.find(
      (group) => group.basis === 'agency',
    )!;
    expect(ids(agency)).toEqual(['earlier']);
    expect(agency.count).toBe(1);
  });

  test('an undated TOR has no earlier projects, so every group is empty', async () => {
    const service = await build([tor({ announceDate: null }), record('a'), record('b')]);

    const { groups } = await service.budgetComparison(TOR, 'officer');
    expect(groups.every((group) => group.count === 0 && group.criterion === null)).toBe(true);
  });

  test('a project without a planned budget is not comparable', async () => {
    const service = await build([tor(), record('none', { projectMoney: null }), record('a')]);

    const agency = (await service.budgetComparison(TOR, 'officer')).groups.find(
      (group) => group.basis === 'agency',
    )!;
    expect(ids(agency)).toEqual(['a']);
  });
});

describe('budgetComparison: only what an officer may see is compared', () => {
  const notVisible: IngestionOutcome[] = [
    'queued',
    'downloading',
    'analysing',
    'needs_review',
    'analysis_failed',
    'no_tor_in_archive',
    'no_tor_package',
    'out_of_scope',
    'error',
    'abandoned',
  ];

  test.each(notVisible)(
    'a project that is %s is never counted, with a budget and an analysis',
    async (outcome) => {
      const service = await build([
        tor(),
        record('visible'),
        record('hidden', {
          outcome,
          holdReason: outcome === 'needs_review' ? 'partial_read' : null,
        }),
      ]);

      for (const audience of ['officer', 'admin'] as const) {
        const agency = (await service.budgetComparison(TOR, audience)).groups.find(
          (group) => group.basis === 'agency',
        )!;
        expect(ids(agency)).toEqual(['visible']);
      }
    },
  );

  test('a removed project is never counted', async () => {
    const service = await build([
      tor(),
      record('visible'),
      record('removed', {
        publicationRemoval: { at: '2026-02-01T00:00:00.000Z', by: null, reportId: null },
      }),
    ]);

    const agency = (await service.budgetComparison(TOR, 'admin')).groups.find(
      (group) => group.basis === 'agency',
    )!;
    expect(ids(agency)).toEqual(['visible']);
  });

  test('a held project an administrator approved is officer-visible, so it counts', async () => {
    const service = await build([
      tor(),
      record('approved', { approved: { by: 'admin-1', at: '2026-02-01T00:00:00.000Z' } }),
    ]);

    const agency = (await service.budgetComparison(TOR, 'officer')).groups.find(
      (group) => group.basis === 'agency',
    )!;
    expect(ids(agency)).toEqual(['approved']);
  });

  test('the pool is exactly the records isVisibleTo(officer) allows, whoever asks', async () => {
    const pool: Procurement[] = [
      record('v1'),
      record('v2', { approved: { by: 'a', at: LATER } }),
      record('held', { outcome: 'needs_review', holdReason: 'ai_low_confidence' }),
      record('queued', { outcome: 'queued' }),
      record('removed', { publicationRemoval: { at: LATER, by: null, reportId: null } }),
    ];
    const service = await build([tor(), ...pool]);
    const expected = pool.filter((item) => isVisibleTo('officer', item)).map((i) => i.projectId);

    const asOfficer = await service.budgetComparison(TOR, 'officer');
    const asAdmin = await service.budgetComparison(TOR, 'admin');

    expect(asAdmin).toEqual(asOfficer);
    expect(ids(asOfficer.groups.find((group) => group.basis === 'agency')!)).toEqual(
      expected.sort(),
    );
  });

  test('an administrator opening a held TOR compares it with the officer-visible pool only', async () => {
    const service = await build([
      tor({ outcome: 'needs_review', holdReason: 'partial_read' }),
      record('visible'),
      record('also-held', { outcome: 'needs_review', holdReason: 'partial_read' }),
    ]);

    const agency = (await service.budgetComparison(TOR, 'admin')).groups.find(
      (group) => group.basis === 'agency',
    )!;
    expect(ids(agency)).toEqual(['visible']);
    await expect(service.budgetComparison(TOR, 'officer')).rejects.toBeInstanceOf(NotFoundError);
  });

  test('nothing admin-only is in the answer', async () => {
    const service = await build([
      tor(),
      record('v', { approved: { by: 'secret-admin', at: LATER }, holdReason: null }),
    ]);

    const text = JSON.stringify(await service.budgetComparison(TOR, 'officer'));
    for (const word of ['holdReason', 'approved', 'secret-admin', 'statusHistory', 'archive']) {
      expect(text).not.toContain(word);
    }
  });
});

describe('budgetComparison: count, summary and listing', () => {
  const pool = (budgets: number[]) =>
    budgets.map((budget, index) => record(`c${index + 1}`, { projectMoney: budget }));

  test('below five comparables there is a count and a listing but no summary', async () => {
    const service = await build([tor(), ...pool([900_000, 950_000, 1_100_000, 1_200_000])]);

    const agency = (await service.budgetComparison(TOR, 'officer')).groups.find(
      (group) => group.basis === 'agency',
    )!;
    expect(agency.count).toBe(4);
    expect(agency.summary).toBeNull();
    expect(agency.projects).toHaveLength(4);
  });

  test('count and statistics cover every eligible project while ten are listed, nearest first', async () => {
    const budgets = Array.from({ length: 12 }, (_, i) => 100_000 * (i + 1));
    const service = await build([tor({ projectMoney: 650_000 }), ...pool(budgets)]);

    const agency = (await service.budgetComparison(TOR, 'officer')).groups.find(
      (group) => group.basis === 'agency',
    )!;
    expect(agency.count).toBe(12);
    expect(agency.projects).toHaveLength(10);
    expect(agency.summary).toMatchObject({
      min: 100_000,
      median: 650_000,
      max: 1_200_000,
      below: 6,
      above: 6,
      rank: 7,
      rankOf: 13,
    });
    expect(agency.projects.map((project) => Math.abs(project.difference))).toEqual(
      [...agency.projects.map((project) => Math.abs(project.difference))].sort((a, b) => a - b),
    );
    expect(agency.projects[0]!.difference).toBe(-50_000);
  });
});
