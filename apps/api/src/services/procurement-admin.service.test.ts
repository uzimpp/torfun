import { describe, expect, test } from 'bun:test';
import { fakeAnnouncements } from '../testing/announcement-client';
import { EMPTY_MILESTONES, type Procurement } from '@torfun/types';
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
    province: null,
    district: null,
    subdistrict: null,
    deptCode: '0100',
    budgetYear: 2568,
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
    winner: null,
    torAmbiguous: false,
    discoveredAt: '2026-09-09T00:00:00.000Z',
    sourceHash: null,
    updatedAt: '2026-09-09T00:00:00.000Z',
    ...overrides,
  };
}

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

  test('asks for one Run for that project, sweeping afresh because that is where its details come from', async () => {
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

  test('a Run already going refuses it and the tombstone stays', async () => {
    const store = new InMemoryProcurementStore();
    await store.tombstone(tombstone);
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

    expect(await store.listTombstones()).toEqual([tombstone]);
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

  test('reads the restored project once and nothing else, through the same pipeline', async () => {
    const store = new InMemoryProcurementStore();
    const tombstone = {
      projectId: '66059313551',
      reason: 'admin_non_software' as const,
      evidence: 'x',
      promptVersion: null,
      decidedAt: '2026-10-02T00:00:00.000Z',
      decidedBy: 'somchai',
    };
    await store.tombstone(tombstone);

    const asked: string[] = [];
    const deps: IngestionDeps = {
      discoverProjects: async (_key, tombstonedIds) => {
        // What the real sweep does: whatever still has a tombstone is not admitted.
        const feed = ['66059313551', '66059313552', '66059313553'];
        const ruledOut = await tombstonedIds(feed);
        return {
          records: feed.filter((id) => !ruledOut.has(id)).map(feedRow),
          rejected: [],
          notEBidding: 0,
          tombstoned: ruledOut.size,
          resolutions: [],
          failures: [],
          rateLimited: false,
          budgetReached: false,
          quota: null,
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

    await admin.restoreTombstone('66059313551', 'napa');
    await new Promise((resolve) => setTimeout(resolve, 30));

    expect(asked).toEqual(['66059313551']); // one site lookup, for the restored project
    expect((await store.get('66059313551'))?.outcome).toBe('no_tor_package');
    expect((await store.get('66059313552'))?.outcome).toBe('queued'); // found by the sweep, not read
    expect(await store.listTombstones()).toEqual([]);
  });
});
