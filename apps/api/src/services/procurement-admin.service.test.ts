import { describe, expect, test } from 'bun:test';
import { fakeAnnouncements } from '../testing/announcement-client';
import { EMPTY_MILESTONES, type Procurement, type Tombstone } from '@torfun/types';
import { ConflictError, NotFoundError } from '../core/errors';
import { silentLogger } from '../testing/gated-ingestion';
import { InMemoryProcurementStore } from '../testing/procurement-store';
import { InMemoryIngestionLease } from '../testing/ingestion-lease';
import { testEnv } from '../testing/env';
import { InMemoryScheduleStore } from '../testing/schedule-store';
import { InMemoryIngestionRunStore, noStats } from '../testing/ingestion-run-store';
import type { IngestionDeps } from './egp/pipeline';
import { IngestionService, type StartRunInput } from './ingestion.service';
import { ProcurementAdminService } from './procurement-admin.service';
import { isVisibleTo } from './audience';

/**
 * What an administrator may do to a procurement the pipeline has stored or
 * dropped. Each action records who did it and when, and none of them reads the
 * upstream site by itself.
 */

const AT = new Date('2026-10-03T08:00:00.000Z');

function record(overrides: Partial<Procurement> = {}): Procurement {
  return {
    projectId: '66059313551',
    projectName: 'จ้างพัฒนาระบบสารสนเทศ',
    deptName: 'กรุงเทพมหานคร',
    deptSubName: null,
    deptCode: '0100',
    budgetYear: 2568,
    typeId: null,
    goodsId: null,
    detailCheckedAt: '2026-09-01T00:00:00.000Z',
    announceDate: null,
    projectTypeName: null,
    purchaseMethodName: null,
    projectMoney: null,
    priceBuild: null,
    status: 'open',
    milestones: EMPTY_MILESTONES,
    timelineCheckedAt: null,
    deadlineAt: null,
    deadlineSource: null,
    state: 'Completed',
    outcome: 'needs_review',
    attempts: 0,
    holdReason: 'ai_low_confidence',
    approvedBy: null,
    approvedAt: null,
    statusHistory: [],
    zipId: 'zip-1',
    documents: [],
    analysis: {
      summary: 'สรุป',
      scopeOfWork: [],
      budgetThb: null,
      deadlineAt: null,
      durationDays: null,
      techStack: [],
      targetPlatforms: [],
      requiredQualifications: [],
      reason: 'ขอบเขตไม่ชัดเจน "พัฒนาระบบ"',
    },
    torAmbiguous: false,
    discoveredAt: '2026-09-09T00:00:00.000Z',
    sourceHash: null,
    updatedAt: '2026-09-09T00:00:00.000Z',
    ...overrides,
  };
}

/** What the feed said about `record()`, as its tombstone keeps it. */
const storedFeed = {
  projectName: 'จ้างพัฒนาระบบสารสนเทศ',
  deptName: 'กรุงเทพมหานคร',
  deptCode: '0100',
  announceDate: null,
  budgetYear: 2568,
  purchaseMethodName: null,
};

async function build(stored: Procurement[] = [record()]) {
  const store = new InMemoryProcurementStore();
  for (const item of stored) await store.upsert(item);
  const runs: StartRunInput[] = [];
  const service = new ProcurementAdminService(
    store,
    async (input) => {
      runs.push(input);
      await input.beforeRun?.();
    },
    silentLogger,
    () => AT,
  );
  return { store, service, runs };
}

describe('approving a held procurement', () => {
  test('shows it to officers and records which administrator did it, and when', async () => {
    const { store, service } = await build();

    await service.approve('66059313551', 'somchai');

    const approved = await store.get('66059313551');
    expect(isVisibleTo('officer', approved!)).toBe(true);
    expect(approved).toMatchObject({
      state: 'Completed',
      holdReason: null,
      approvedBy: 'somchai',
      approvedAt: AT.toISOString(),
    });
    expect(approved?.analysis?.summary).toBe('สรุป'); // what was read is kept
  });

  test('an unknown project is not found', async () => {
    const { service } = await build([]);

    await expect(service.approve('nope', 'somchai')).rejects.toBeInstanceOf(NotFoundError);
  });

  test.each(['queued', 'tor_analysed', 'analysis_failed'] as const)(
    'a record that is %s is not held, so approving it is refused and changes nothing',
    async (outcome) => {
      const { store, service } = await build([record({ outcome, holdReason: null })]);

      await expect(service.approve('66059313551', 'somchai')).rejects.toBeInstanceOf(ConflictError);

      expect((await store.get('66059313551'))?.approvedBy).toBeNull();
    },
  );
});

describe('marking a procurement as non-software', () => {
  test('deletes what was read and leaves a tombstone with the model’s reason, who decided and when', async () => {
    const { store, service } = await build();

    await service.markNonSoftware('66059313551', 'somchai');

    expect(await store.get('66059313551')).toBeUndefined();
    expect(await store.listTombstones()).toEqual([
      {
        projectId: '66059313551',
        reason: 'admin_non_software',
        evidence: 'ขอบเขตไม่ชัดเจน "พัฒนาระบบ"',
        promptVersion: null,
        decidedAt: AT.toISOString(),
        decidedBy: 'somchai',
        feed: storedFeed,
      },
    ]);
  });

  test('works on a record the model never reasoned about, and says so in the evidence', async () => {
    const { store, service } = await build([record({ outcome: 'queued', analysis: null })]);

    await service.markNonSoftware('66059313551', 'somchai');

    const [tombstone] = await store.listTombstones();
    expect(tombstone?.evidence).toBe('ผู้ดูแลระบบระบุว่าไม่ใช่ซอฟต์แวร์');
  });

  test('an unknown project is not found, and nothing is tombstoned', async () => {
    const { store, service } = await build([]);

    await expect(service.markNonSoftware('nope', 'somchai')).rejects.toBeInstanceOf(NotFoundError);

    expect(await store.listTombstones()).toEqual([]);
  });
});

describe('deleting a procurement', () => {
  test('blocking re-import deletes the record and tombstones it as deleted, by whom and when', async () => {
    const { store, service } = await build();

    await service.deleteProcurement('66059313551', 'somchai', { allowReimport: false });

    expect(await store.get('66059313551')).toBeUndefined();
    expect(await store.listTombstones()).toEqual([
      {
        projectId: '66059313551',
        reason: 'admin_deleted',
        evidence: 'ผู้ดูแลระบบลบและไม่ให้ดึงซ้ำ',
        promptVersion: null,
        decidedAt: AT.toISOString(),
        decidedBy: 'somchai',
        feed: storedFeed,
      },
    ]);
    expect(await store.tombstonedIds(['66059313551'])).toEqual(new Set(['66059313551']));
  });

  test('allowing re-import deletes the record and leaves nothing behind to stop the next sweep', async () => {
    const { store, service } = await build();

    await service.deleteProcurement('66059313551', 'somchai', { allowReimport: true });

    expect(await store.get('66059313551')).toBeUndefined();
    expect(await store.listTombstones()).toEqual([]);
  });

  test.each([true, false])(
    'an unknown project is not found (allowReimport %p)',
    async (allowReimport) => {
      const { store, service } = await build([]);

      await expect(
        service.deleteProcurement('nope', 'somchai', { allowReimport }),
      ).rejects.toBeInstanceOf(NotFoundError);

      expect(await store.listTombstones()).toEqual([]);
    },
  );
});

describe('the tombstones', () => {
  const tombstone = {
    projectId: '66059313551',
    reason: 'ai_not_software' as const,
    evidence: 'จัดซื้อเครื่องคอมพิวเตอร์',
    promptVersion: '2026-10-01.1',
    decidedAt: '2026-10-02T00:00:00.000Z',
    decidedBy: null,
  };

  test('are listed for an administrator, with their reasons', async () => {
    const { store, service } = await build([]);
    await store.tombstone(tombstone);

    expect(await service.tombstones()).toEqual([tombstone]);
  });

  test('removing one lets the next sweep admit the project, and stores and reads nothing itself', async () => {
    const { store, service } = await build([]);
    await store.tombstone(tombstone);

    await service.removeTombstone('66059313551', 'somchai');

    expect(await store.tombstonedIds(['66059313551'])).toEqual(new Set());
    expect(await store.get('66059313551')).toBeUndefined();
  });

  test('removing one that is not there is not found', async () => {
    const { service } = await build([]);

    await expect(service.removeTombstone('nope', 'somchai')).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('restoring a tombstone', () => {
  const tombstone = {
    projectId: '66059313551',
    reason: 'admin_non_software' as const,
    evidence: 'จัดซื้อเครื่องคอมพิวเตอร์',
    promptVersion: null,
    decidedAt: '2026-10-02T00:00:00.000Z',
    decidedBy: 'somchai',
  };

  const feed = {
    projectName: 'จ้างพัฒนาระบบสารสนเทศ',
    deptName: 'กรมศุลกากร',
    deptCode: '0305',
    announceDate: '2026-09-30T00:00:00.000Z',
    budgetYear: 2569,
    purchaseMethodName: 'ประกวดราคาอิเล็กทรอนิกส์ (e-bidding)',
  };

  test('one that kept the feed snapshot comes back Queued from it, and the Run is not made to sweep', async () => {
    const { store, service, runs } = await build([]);
    await store.tombstone({ ...tombstone, feed });

    await service.restoreTombstone('66059313551', 'napa');

    expect(runs).toHaveLength(1);
    expect(runs[0]?.onlyProject).toBe('66059313551');
    expect(runs[0]?.forceDiscovery).toBeFalsy();
    expect(await store.get('66059313551')).toMatchObject({
      ...feed,
      state: 'Queued',
      outcome: 'queued',
      attempts: 0,
      status: 'unknown',
      analysis: null,
      documents: [],
    });
  });

  test('one written before snapshots asks for one Run for that project, sweeping afresh because that is where its details come from', async () => {
    const { store, service, runs } = await build([]);
    await store.tombstone(tombstone);

    await service.restoreTombstone('66059313551', 'napa');

    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({ onlyProject: '66059313551', forceDiscovery: true });
  });

  test('lifts the tombstone only once the Run really begins', async () => {
    const { store, service } = await build([]);
    await store.tombstone(tombstone);

    await service.restoreTombstone('66059313551', 'napa');

    expect(await store.listTombstones()).toEqual([]);
  });

  test('a Run already going refuses it: the tombstone stays and nothing is queued', async () => {
    const store = new InMemoryProcurementStore();
    await store.tombstone({ ...tombstone, feed });
    const service = new ProcurementAdminService(
      store,
      async () => {
        throw new ConflictError('An ingestion run is already in progress.');
      },
      silentLogger,
    );

    await expect(service.restoreTombstone('66059313551', 'napa')).rejects.toBeInstanceOf(
      ConflictError,
    );

    expect(await store.listTombstones()).toEqual([{ ...tombstone, feed }]);
    expect(await store.get('66059313551')).toBeUndefined();
  });

  test('a project with no tombstone is not found, and no Run is asked for', async () => {
    const { service, runs } = await build([]);

    await expect(service.restoreTombstone('nope', 'napa')).rejects.toBeInstanceOf(NotFoundError);

    expect(runs).toEqual([]);
  });
});

describe('restoring a tombstone, end to end through a real Run', () => {
  const feedRow = (projectId: string): Procurement =>
    record({ projectId, state: 'Queued', outcome: 'queued', holdReason: null, analysis: null });

  const dropped = {
    projectId: '66059313551',
    reason: 'admin_non_software' as const,
    evidence: 'x',
    promptVersion: null,
    decidedAt: '2026-10-02T00:00:00.000Z',
    decidedBy: 'somchai',
  };

  /**
   * A store holding `tombstone`, a Run whose sweep lists `swept`, and an
   * administrator who restores the tombstone. Returns which projects the site
   * was asked about.
   */
  async function restoreThroughRun(tombstone: Tombstone, swept: string[]) {
    const store = new InMemoryProcurementStore();
    await store.tombstone(tombstone);

    const asked: string[] = [];
    const deps: IngestionDeps = {
      discoverProjects: async ({ tombstonedIds }) => {
        // What the real sweep does: whatever still has a tombstone is not admitted.
        const ruledOut = await tombstonedIds(swept);
        return {
          records: swept.filter((id) => !ruledOut.has(id)).map(feedRow),
          notEBidding: 0,
          tombstoned: ruledOut.size,
          truncated: 0,
          failures: [],
          rateLimited: false,
          cursor: {},
          ranAt: new Date().toISOString(),
        };
      },
      resolveZipId: async (projectId) => {
        asked.push(projectId);
        return null;
      },
      downloadArchive: async () => new Uint8Array(),
      extractTorPdfs: () => ({ torFiles: [], members: [], unsafeSkipped: [] }),
      classifyDocument: async () => {
        throw new Error('no document is read in this test');
      },
      readInvitation: async () => ({ documents: [], bidAt: null }),
      announcements: fakeAnnouncements({}, []),
      sleep: async () => {},
      recordDeadlineMs: 60_000,
    };
    const ingestion = new IngestionService(
      store,
      testEnv({ EGP_RUNNERS: 2 }),
      silentLogger,
      {
        lease: new InMemoryIngestionLease(),
        runLog: new InMemoryScheduleStore(),
        runs: new InMemoryIngestionRunStore(),
        stats: noStats,
      },
      () => deps,
    );
    const admin = new ProcurementAdminService(
      store,
      (input) => ingestion.startRun(input),
      silentLogger,
    );

    await admin.restoreTombstone(tombstone.projectId, 'napa');
    await new Promise((resolve) => setTimeout(resolve, 30));
    return { store, asked };
  }

  test('reads the restored project once and nothing else, through the same pipeline', async () => {
    const { store, asked } = await restoreThroughRun(dropped, [
      '66059313551',
      '66059313552',
      '66059313553',
    ]);

    expect(asked).toEqual(['66059313551']); // one site lookup, for the restored project
    expect((await store.get('66059313551'))?.outcome).toBe('no_tor_package');
    expect((await store.get('66059313552'))?.outcome).toBe('queued'); // found by the sweep, not read
    expect(await store.listTombstones()).toEqual([]);
  });

  test('reads a project with a feed snapshot even when no sweep lists it again', async () => {
    // The feed is read by date, so a project announced months ago is not in
    // the days a sweep asks about; the snapshot is what brings it back.
    const feed = {
      projectName: 'จ้างพัฒนาระบบสารสนเทศ',
      deptName: 'กรมศุลกากร',
      deptCode: '0305',
      announceDate: '2026-03-02T00:00:00.000Z',
      budgetYear: 2569,
      purchaseMethodName: 'ประกวดราคาอิเล็กทรอนิกส์ (e-bidding)',
    };
    const { store, asked } = await restoreThroughRun({ ...dropped, feed }, ['66059313552']);

    expect(asked).toEqual(['66059313551']);
    expect(await store.get('66059313551')).toMatchObject({
      projectName: feed.projectName,
      outcome: 'no_tor_package',
    });
    expect(await store.listTombstones()).toEqual([]);
  });
});
