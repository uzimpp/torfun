import { describe, expect, mock, test } from 'bun:test';
import { EMPTY_MILESTONES, type Procurement } from '@torfun/types';
import { fakeAnnouncements } from '../../testing/announcement-client';
import { InMemoryProcurementStore } from '../../testing/procurement-store';
import { RateLimitedError } from './client';
import type { DiscoveryResult, SweepContext } from './discovery';
import type { AnnouncementRow } from './milestones';
import { runIngestion, type IngestionDeps } from './pipeline';
import type { ExtractedPdf } from './tor-package';
import type { RunProgress } from '@torfun/types';

const logger = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
} as unknown as IngestionDeps extends never ? never : Parameters<typeof runIngestion>[1]['logger'];

function procurement(overrides: Partial<Procurement> = {}): Procurement {
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
    announceDate: '2026-08-01',
    projectTypeName: 'จ้างทำของ',
    purchaseMethodName: 'ประกวดราคาอิเล็กทรอนิกส์ (e-bidding)',
    projectMoney: 5_000_000,
    priceBuild: null,
    status: 'open',
    milestones: EMPTY_MILESTONES,
    timelineCheckedAt: null,
    deadlineAt: null,
    deadlineSource: null,
    state: 'Queued',
    outcome: 'queued',
    attempts: 0,
    holdReason: null,
    approvedBy: null,
    approvedAt: null,
    statusHistory: [],
    zipId: null,
    documents: [],
    analysis: null,
    torAmbiguous: false,
    discoveredAt: '2026-09-09T00:00:00.000Z',
    sourceHash: null,
    updatedAt: '2026-09-09T00:00:00.000Z',
    ...overrides,
  };
}

const pdfBytes = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(100, 0x20)]);

function extracted(overrides: Partial<ExtractedPdf> = {}): ExtractedPdf {
  return {
    member: 'Attach_TOR_1.pdf',
    filename: 'Attach_TOR_1.pdf',
    bytes: pdfBytes.byteLength,
    namePattern: 'canonical',
    payload: new Uint8Array(pdfBytes),
    ...overrides,
  };
}

const analysis = {
  summary: 'จ้างพัฒนาระบบสารสนเทศสำหรับงานทะเบียน',
  scopeOfWork: ['พัฒนาเว็บแอปพลิเคชัน'],
  budgetThb: 4_500_000,
  deadlineAt: '2026-10-15',
  durationDays: 180,
  techStack: ['React'],
  targetPlatforms: ['web_app' as const],
  requiredQualifications: [],
  reason: 'พัฒนาระบบ',
};

/** What the model concluded about the work, beside the analysis it is stored with. */
const judgement = { isSoftware: true, confidence: 'high' as const, reason: 'พัฒนาระบบ' };

/** A sweep context for calling a stubbed `discoverProjects` directly. */
const sweepContext: SweepContext = {
  site: (call) => call(),
  cursor: {},
  tombstonedIds: async () => new Set(),
  today: '2026-09-09',
};

/** Every stage stubbed to the happy path; each test overrides what it is about. */
function deps(overrides: Partial<IngestionDeps> = {}): IngestionDeps {
  return {
    discoverProjects: async () => ({
      records: [procurement()],
      notEBidding: 0,
      tombstoned: 0,
      truncated: 0,
      failures: [],
      rateLimited: false,
      cursor: {},
      ranAt: '2026-09-09T00:00:00.000Z',
    }),
    resolveZipId: async () => 'zip-1',
    downloadArchive: async () => new Uint8Array([0x50, 0x4b, 0x03, 0x04]),
    extractTorPdfs: () => ({
      torFiles: [extracted()],
      members: ['Attach_TOR_1.pdf', 'annoudoc_1.pdf'],
      unsafeSkipped: [],
    }),
    classifyDocument: async () => ({
      isTor: true,
      torKind: 'final',
      whatThisIs: 'ขอบเขตของงาน',
      analysis,
      judgement,
      readMode: 'pdf' as const,
    }),
    readInvitation: async () => ({ documents: [], bidAt: null }),
    announcements: fakeAnnouncements({}, []),
    sleep: async () => {},
    recordDeadlineMs: 60_000,
    ...overrides,
  };
}

const run = (repository: InMemoryProcurementStore, overrides: Partial<IngestionDeps> = {}) =>
  runIngestion(repository, { logger }, deps(overrides));

describe('runIngestion', () => {
  test('a classified TOR is stored with its analysis', async () => {
    const repository = new InMemoryProcurementStore();
    const result = await run(repository);

    const record = await repository.get('66059313551');
    expect(record?.outcome).toBe('tor_analysed');
    expect(record?.state).toBe('Completed');
    expect(record?.analysis?.budgetThb).toBe(4_500_000);
    expect(
      record?.documents.find((d: { role: string; filename: string }) => d.role === 'main_tor')
        ?.filename,
    ).toBe('Attach_TOR_1.pdf');
    expect(result).toMatchObject({ torAnalysed: 1, held: 0, dropped: 0 });
  });

  test('PDF bytes are never written to the record', async () => {
    // ADR-0002: nothing is persisted but the manifest. A payload reaching the
    // repository would be written to Mongo on the next run.
    const repository = new InMemoryProcurementStore();
    await run(repository);

    const serialised = JSON.stringify(await repository.get('66059313551'));
    expect(serialised).not.toContain('payload');
    expect(serialised).not.toContain('%PDF');
  });

  test('a document the model rejects leaves the archive with no TOR', async () => {
    const repository = new InMemoryProcurementStore();
    await run(repository, {
      extractTorPdfs: () => ({
        torFiles: [extracted({ member: 'CONTRACTOR.pdf', filename: 'CONTRACTOR.pdf' })],
        members: ['CONTRACTOR.pdf'],
        unsafeSkipped: [],
      }),
      classifyDocument: async () => ({
        isTor: false,
        torKind: null,
        whatThisIs: 'หนังสือรับรองผู้รับจ้าง',
        analysis: null,
        judgement: null,
      }),
    });

    const record = await repository.get('66059313551');
    expect(record?.outcome).toBe('no_tor_in_archive');
    expect(record?.documents[0]?.role).toBe('not_tor');
  });

  test('an analysis failure keeps the retrieval, so a retry costs nothing upstream', async () => {
    const repository = new InMemoryProcurementStore();
    await run(repository, {
      classifyDocument: async () => ({
        isTor: false,
        torKind: null,
        whatThisIs: '',
        analysis: null,
        judgement: null,
        unreadable: '429 Resource exhausted',
      }),
    });

    const record = await repository.get('66059313551');
    expect(record?.state).toBe('Completed');
    expect(record?.outcome).toBe('analysis_failed');
    expect(record?.documents[0]?.role).toBe('unreadable');
    expect(record?.zipId).toBe('zip-1');
  });

  test('a project with no published TOR package is a real answer, not an error', async () => {
    const repository = new InMemoryProcurementStore();
    await run(repository, { resolveZipId: async () => null });

    expect((await repository.get('66059313551'))?.outcome).toBe('no_tor_package');
  });

  test('a failure logged because no TOR was published is marked as such, not as a fault', async () => {
    const noPackage = new InMemoryProcurementStore();
    await run(noPackage, { resolveZipId: async () => null });
    const emptyArchive = new InMemoryProcurementStore();
    await run(emptyArchive, {
      classifyDocument: async () => ({
        isTor: false,
        torKind: null,
        whatThisIs: 'หนังสือรับรองผู้รับจ้าง',
        analysis: null,
        judgement: null,
      }),
    });

    expect((await noPackage.listFailures()).map((f) => [f.stage, f.kind])).toEqual([
      ['info', 'no_tor'],
    ]);
    expect((await emptyArchive.listFailures()).map((f) => [f.stage, f.kind])).toEqual([
      ['extract', 'no_tor'],
    ]);
  });

  test('every other logged failure is a fault', async () => {
    const repository = new InMemoryProcurementStore();
    await run(repository, {
      extractTorPdfs: () => ({
        torFiles: [extracted()],
        members: ['Attach_TOR_1.pdf'],
        unsafeSkipped: ['../../etc/Attach_TOR_evil.pdf'],
      }),
      classifyDocument: async () => ({
        isTor: false,
        torKind: null,
        whatThisIs: '',
        analysis: null,
        judgement: null,
        unreadable: '429 Resource exhausted',
      }),
    });

    const failures = await repository.listFailures();
    expect(failures.map((f) => [f.stage, f.kind])).toEqual([
      ['extract', 'fault'],
      ['analysis', 'fault'],
    ]);
  });

  test('a rate limit aborts the run and leaves the rest Queued', async () => {
    const repository = new InMemoryProcurementStore();
    const second = procurement({ projectId: '66059313552' });
    const result = await run(repository, {
      discoverProjects: async () => ({
        records: [procurement(), second],
        notEBidding: 0,
        tombstoned: 0,
        truncated: 0,
        failures: [],
        rateLimited: false,
        cursor: {},
        ranAt: '2026-09-09T00:00:00.000Z',
      }),
      resolveZipId: async () => {
        throw new RateLimitedError('https://process5.gprocurement.go.th/…', 429);
      },
    });

    expect(result.aborted).toBe(true);
    expect((await repository.get('66059313552'))?.state).toBe('Queued');
  });

  test('any other failure is logged and the pass continues', async () => {
    const repository = new InMemoryProcurementStore();
    const failing = mock(async (projectId: string) => {
      if (projectId === '66059313551') throw new Error('connection reset');
      return 'zip-2';
    });

    const result = await run(repository, {
      discoverProjects: async () => ({
        records: [procurement(), procurement({ projectId: '66059313552' })],
        notEBidding: 0,
        tombstoned: 0,
        truncated: 0,
        failures: [],
        rateLimited: false,
        cursor: {},
        ranAt: '2026-09-09T00:00:00.000Z',
      }),
      resolveZipId: failing,
    });

    expect(result.aborted).toBe(false);
    expect((await repository.get('66059313551'))?.outcome).toBe('error');
    expect((await repository.get('66059313552'))?.outcome).toBe('tor_analysed');
    expect(
      (await repository.listFailures()).some((f: { error: string }) =>
        f.error.includes('connection reset'),
      ),
    ).toBe(true);
  });

  test('a path-traversal member is surfaced, never dropped', async () => {
    const repository = new InMemoryProcurementStore();
    await run(repository, {
      extractTorPdfs: () => ({
        torFiles: [extracted()],
        members: ['Attach_TOR_1.pdf'],
        unsafeSkipped: ['../../etc/Attach_TOR_evil.pdf'],
      }),
    });

    expect(
      (await repository.listFailures()).some((f: { error: string }) =>
        f.error.includes('../../etc/Attach_TOR_evil.pdf'),
      ),
    ).toBe(true);
  });

  test('a document is classified once per candidate, and only candidates', async () => {
    const repository = new InMemoryProcurementStore();
    const classify = mock(async () => ({
      isTor: true,
      torKind: 'final' as const,
      whatThisIs: 'ขอบเขตของงาน',
      analysis,
      judgement,
    }));

    await run(repository, {
      extractTorPdfs: () => ({
        torFiles: [extracted(), extracted({ member: 'TOR.pdf', filename: 'TOR.pdf' })],
        // The archive holds far more than the two candidates; the rest are
        // never sent, because reading them costs tokens for nothing.
        members: ['Attach_TOR_1.pdf', 'TOR.pdf', 'annoudoc_1.pdf', 'Attach_PUB_9.pdf'],
        unsafeSkipped: [],
      }),
      classifyDocument: classify,
    });

    expect(classify).toHaveBeenCalledTimes(2);
    expect((await repository.get('66059313551'))?.torAmbiguous).toBe(true);
  });
});

describe('stages and the per-record deadline', () => {
  test('a record is downloading, then analysing, then done', async () => {
    const repository = new InMemoryProcurementStore();
    await run(repository);

    const outcomes = (await repository.get('66059313551'))?.statusHistory.map((s) => s.outcome);
    expect(outcomes).toEqual(['downloading', 'analysing', 'tor_analysed']);
  });

  test('a record with nothing to read never reaches analysing', async () => {
    const repository = new InMemoryProcurementStore();
    await run(repository, {
      extractTorPdfs: () => ({ torFiles: [], members: ['annoudoc_1.pdf'], unsafeSkipped: [] }),
    });

    const outcomes = (await repository.get('66059313551'))?.statusHistory.map((s) => s.outcome);
    expect(outcomes).toEqual(['downloading', 'no_tor_in_archive']);
  });

  test('a record that overruns its deadline is requeued as a transport failure, and the run moves on', async () => {
    const repository = new InMemoryProcurementStore();
    let release: () => void = () => {};
    const hung = new Promise<void>((resolve) => {
      release = resolve;
    });
    const result = await run(repository, {
      recordDeadlineMs: 20,
      discoverProjects: async () => ({
        records: [procurement(), procurement({ projectId: '66059313552' })],
        notEBidding: 0,
        tombstoned: 0,
        truncated: 0,
        failures: [],
        rateLimited: false,
        cursor: {},
        ranAt: '2026-09-09T00:00:00.000Z',
      }),
      classifyDocument: async () => {
        await hung;
        return {
          isTor: true,
          torKind: 'final' as const,
          whatThisIs: 'ขอบเขตของงาน',
          analysis,
          judgement,
        };
      },
    });

    // Both records hang, neither takes the whole run down with it.
    expect(result.aborted).toBe(false);
    expect(result.attempted).toBe(2);
    const first = await repository.get('66059313551');
    expect(first?.state).toBe('Queued');
    expect(first?.outcome).toBe('error');
    expect(first?.attempts).toBe(1);
    expect(first?.statusHistory.at(-1)?.detail).toMatch(/deadline/i);

    // The stuck work finishing afterwards must not overwrite the requeue.
    release();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect((await repository.get('66059313551'))?.outcome).toBe('error');
  });
});

describe('a discovery sweep inside the Run', () => {
  const sweepResult = (overrides: Partial<DiscoveryResult> = {}): DiscoveryResult => ({
    records: [],
    notEBidding: 0,
    tombstoned: 0,
    truncated: 0,
    cursor: {},
    failures: [],
    rateLimited: false,
    ranAt: new Date().toISOString(),
    ...overrides,
  });

  /** A store with one record already queued, so retrieval has something to do. */
  async function queued() {
    const repository = new InMemoryProcurementStore();
    await repository.upsert(procurement());
    return repository;
  }

  test('a refusal during discovery ends the Run: no record is retrieved', async () => {
    const repository = await queued();
    const resolveZipId = mock(async () => 'zip-1');
    const timeline = mock(async () => []);

    const result = await run(repository, {
      discoverProjects: async () => sweepResult({ rateLimited: true }),
      resolveZipId,
      announcements: { ...fakeAnnouncements(), timeline },
    });

    expect(result.discoveryStopped).toBe('rate_limited');
    expect(result.aborted).toBe(true);
    expect(result.attempted).toBe(0);
    expect(resolveZipId).not.toHaveBeenCalled();
    expect(timeline).not.toHaveBeenCalled();
    const record = await repository.get('66059313551');
    expect(record?.state).toBe('Queued');
    expect(record?.attempts).toBe(0);
  });

  test('a Run for one project that the site refused does not blame the queue', async () => {
    const repository = await queued();

    const result = await runIngestion(
      repository,
      { logger, onlyProject: '66059313551' },
      deps({ discoverProjects: async () => sweepResult({ rateLimited: true }) }),
    );

    expect(result.failures.some((failure) => failure.error.includes('not in the queue'))).toBe(
      false,
    );
    expect((await repository.get('66059313551'))?.state).toBe('Queued');
  });

  test('the cursor a sweep reached is stored even when the site cut it short', async () => {
    const repository = await queued();

    await run(repository, {
      discoverProjects: async () =>
        sweepResult({
          rateLimited: true,
          cursor: { '0305:D0': { from: '2026-09-01', to: '2026-09-08' } },
        }),
    });

    expect(await repository.feedCursor()).toEqual({
      '0305:D0': { from: '2026-09-01', to: '2026-09-08' },
    });
  });

  test('the sweep is handed the cursor stored by the last one', async () => {
    const repository = await queued();
    await repository.recordFeedCursor({ '1108:B0': { from: '2026-08-01', to: '2026-09-07' } });
    const discover = mock(async (_context: SweepContext) => sweepResult());

    await run(repository, { discoverProjects: discover });

    expect(discover.mock.calls[0]![0].cursor).toEqual({
      '1108:B0': { from: '2026-08-01', to: '2026-09-07' },
    });
  });

  test('only a finished sweep is marked as done, so a cut-short one is tried again next Run', async () => {
    const repository = await queued();

    await run(repository, { discoverProjects: async () => sweepResult({ rateLimited: true }) });
    expect(await repository.lastDiscoveryAt()).toBeNull();

    const result = await run(repository, { discoverProjects: async () => sweepResult() });
    expect(result.discoveryStopped).toBeNull();
    expect(await repository.lastDiscoveryAt()).not.toBeNull();
  });
});

describe('which stage a failure is logged against', () => {
  const failures = async (overrides: Partial<IngestionDeps>) => {
    const repository = new InMemoryProcurementStore();
    const result = await run(repository, overrides);
    return result.failures.map((failure) => failure.stage);
  };

  test('a failed announcement lookup is an info failure', async () => {
    expect(
      await failures({
        resolveZipId: async () => {
          throw new Error('bad gateway');
        },
      }),
    ).toEqual(['info']);
  });

  test('a failed download is a download failure', async () => {
    expect(
      await failures({
        downloadArchive: async () => {
          throw new Error('connection reset');
        },
      }),
    ).toEqual(['download']);
  });

  test('an archive that cannot be opened is an extract failure, not a download one', async () => {
    expect(
      await failures({
        extractTorPdfs: () => {
          throw new Error('corrupt zip');
        },
      }),
    ).toEqual(['extract']);
  });
});

describe('what a retrieval remembers about the archive', () => {
  test('a file the model judges to be a TOR despite its name is analysed like any other', async () => {
    const repository = new InMemoryProcurementStore();
    await run(repository, {
      extractTorPdfs: () => ({
        torFiles: [
          { ...extracted(), filename: '20240823082250355.pdf', namePattern: 'unlabelled' },
        ],
        members: ['quotation.pdf', '20240823082250355.pdf'],
        unsafeSkipped: [],
      }),
    });

    const record = await repository.get('66059313551');
    expect(record?.outcome).toBe('tor_analysed');
    expect(record?.documents[0]?.namePattern).toBe('unlabelled');
  });
});

describe('a document that was only partly read', () => {
  test('the record says how it was read, so a person knows to check the source', async () => {
    const repository = new InMemoryProcurementStore();
    await run(repository, {
      classifyDocument: async () => ({
        isTor: true,
        torKind: 'final' as const,
        whatThisIs: 'ขอบเขตของงาน',
        analysis,
        // Said with confidence: it is the partial read, not the model, that holds it.
        judgement,
        readMode: 'first_pages' as const,
        readNote: 'อ่านเฉพาะ 30 หน้าแรกจากทั้งหมด 120 หน้า',
      }),
    });

    const record = await repository.get('66059313551');
    // A partial reading is never enough to show a record to an officer.
    expect(record?.outcome).toBe('needs_review');
    expect(record?.holdReason).toBe('partial_read');
    expect(record?.documents[0]?.readMode).toBe('first_pages');
    expect(record?.documents[0]?.readNote).toMatch(/30/);
  });
});

describe('a sweep that only re-sees what it already has', () => {
  const sweep = (overrides: Partial<Procurement> = {}) => ({
    discoverProjects: async () => ({
      records: [procurement(overrides)],
      notEBidding: 0,
      tombstoned: 0,
      truncated: 0,
      failures: [],
      rateLimited: false,
      cursor: {},
      ranAt: '2026-09-09T00:00:00.000Z',
    }),
  });

  test('reports what was new, what moved and what did not', async () => {
    const repository = new InMemoryProcurementStore();

    const first = await run(repository, sweep());
    const again = await run(repository, sweep());
    const moved = await run(repository, sweep({ projectMoney: 9_999_999 }));

    expect([first.newRecords, first.changedRecords, first.unchangedRecords]).toEqual([1, 0, 0]);
    expect([again.newRecords, again.changedRecords, again.unchangedRecords]).toEqual([0, 0, 1]);
    expect([moved.newRecords, moved.changedRecords, moved.unchangedRecords]).toEqual([0, 1, 0]);
  });
});

describe('when discovery runs', () => {
  const HOUR = 60 * 60 * 1000;
  const hoursAgo = (hours: number) => new Date(Date.now() - hours * HOUR).toISOString();

  /** A run against a store that was last swept `lastSweepHoursAgo` ago, with one queued record. */
  async function runWith(
    lastSweepHoursAgo: number | null,
    options: { discoveryMaxAgeMs?: number; forceDiscovery?: boolean },
  ) {
    const repository = new InMemoryProcurementStore();
    await repository.upsert(procurement());
    if (lastSweepHoursAgo !== null) await repository.markRun(hoursAgo(lastSweepHoursAgo));
    const discover = mock(async () => ({
      records: [],
      notEBidding: 0,
      tombstoned: 0,
      truncated: 0,
      failures: [],
      rateLimited: false,
      cursor: {},
      ranAt: new Date().toISOString(),
    }));

    const result = await runIngestion(
      repository,
      { logger, ...options },
      deps({ discoverProjects: discover }),
    );
    return { result, discover, repository };
  }

  test('a recent sweep is not repeated, but queued records are still retrieved', async () => {
    const { result, discover, repository } = await runWith(1, { discoveryMaxAgeMs: 6 * HOUR });

    expect(discover).not.toHaveBeenCalled();
    expect(result.discoverySkipped).toBe(true);
    expect(result.attempted).toBe(1);
    expect((await repository.get('66059313551'))?.outcome).toBe('tor_analysed');
  });

  test('skipping a sweep does not pretend one happened', async () => {
    const { repository } = await runWith(1, { discoveryMaxAgeMs: 6 * HOUR });

    const last = (await repository.summary()).lastRunAt;
    expect(Date.now() - Date.parse(last!)).toBeGreaterThan(0.9 * HOUR);
  });

  test('a stale sweep is repeated', async () => {
    const { result, discover } = await runWith(7, { discoveryMaxAgeMs: 6 * HOUR });

    expect(discover).toHaveBeenCalledTimes(1);
    expect(result.discoverySkipped).toBe(false);
  });

  test('a sweep that was never made is made', async () => {
    const { discover } = await runWith(null, { discoveryMaxAgeMs: 6 * HOUR });

    expect(discover).toHaveBeenCalledTimes(1);
  });

  test('an administrator can force a sweep however recent the last was', async () => {
    const { discover } = await runWith(1, { discoveryMaxAgeMs: 6 * HOUR, forceDiscovery: true });

    expect(discover).toHaveBeenCalledTimes(1);
  });

  test('with no age limit configured it always sweeps, as before', async () => {
    const { discover } = await runWith(0.01, {});

    expect(discover).toHaveBeenCalledTimes(1);
  });
});

describe('a run that is told to stop', () => {
  test('stops before the next record and leaves the rest Queued', async () => {
    const repository = new InMemoryProcurementStore();
    const resolved: string[] = [];
    let allowed = true;

    const result = await runIngestion(
      repository,
      {
        logger,
        shouldContinue: () => allowed,
      },
      deps({
        discoverProjects: async () => ({
          records: [procurement(), procurement({ projectId: '66059313552' })],
          notEBidding: 0,
          tombstoned: 0,
          truncated: 0,
          failures: [],
          rateLimited: false,
          cursor: {},
          ranAt: '2026-09-09T00:00:00.000Z',
        }),
        resolveZipId: async (projectId) => {
          resolved.push(projectId);
          allowed = false; // e.g. the lease was lost while the first record was working
          return 'zip-1';
        },
      }),
    );

    expect(result.aborted).toBe(true);
    expect(result.attempted).toBe(1);
    expect(resolved).toEqual(['66059313551']);
    expect((await repository.get('66059313551'))?.outcome).toBe('tor_analysed');
    const second = await repository.get('66059313552');
    expect(second?.state).toBe('Queued');
    expect(second?.attempts).toBe(0);
  });
});

describe('a deadline that fires while a site request is in flight', () => {
  const two = () => ({
    discoverProjects: async () => ({
      records: [procurement(), procurement({ projectId: '66059313552' })],
      notEBidding: 0,
      tombstoned: 0,
      truncated: 0,
      failures: [],
      rateLimited: false,
      cursor: {},
      ranAt: '2026-09-09T00:00:00.000Z',
    }),
  });

  test('cancels the request and lets it end before the next record starts, so downloads stay single-file', async () => {
    const repository = new InMemoryProcurementStore();
    const events: string[] = [];
    let cancelled = 0;

    await run(repository, {
      ...two(),
      recordDeadlineMs: 20,
      resolveZipId: async (projectId) => {
        events.push(`resolve ${projectId}`);
        return 'zip-1';
      },
      downloadArchive: (_zipId, signal) =>
        new Promise((_resolve, reject) => {
          events.push('download start');
          signal?.addEventListener('abort', () => {
            cancelled += 1;
            // A cancelled request takes a moment to wind down.
            setTimeout(() => {
              events.push('download ended');
              reject(new Error('cancelled'));
            }, 15);
          });
        }),
    });

    expect(cancelled).toBe(2);
    expect(events).toEqual([
      'resolve 66059313551',
      'download start',
      'download ended',
      'resolve 66059313552',
      'download start',
      'download ended',
    ]);
  });

  test('a rate limit that beats the cancellation still stops the run, and costs no attempt', async () => {
    const repository = new InMemoryProcurementStore();
    const resolved: string[] = [];

    const result = await run(repository, {
      ...two(),
      recordDeadlineMs: 20,
      resolveZipId: async (projectId) => {
        resolved.push(projectId);
        return 'zip-1';
      },
      downloadArchive: (_zipId, signal) =>
        new Promise((_resolve, reject) => {
          signal?.addEventListener('abort', () => {
            setTimeout(() => reject(new RateLimitedError('https://site.test/x', 429)), 5);
          });
        }),
    });

    expect(result.aborted).toBe(true);
    expect(resolved).toEqual(['66059313551']); // the second record was never started
    const first = await repository.get('66059313551');
    expect(first?.outcome).toBe('queued');
    expect(first?.attempts).toBe(0);
    expect((await repository.get('66059313552'))?.outcome).toBe('queued');
  });
});

describe('what the model concludes about a TOR', () => {
  test.each([
    { name: 'not software, unsure', isSoftware: false, holdReason: 'ai_not_software_low' },
    { name: 'software, unsure', isSoftware: true, holdReason: 'ai_low_confidence' },
  ])(
    'a TOR the model is unsure about ($name) is held with the reason, its analysis kept',
    async ({ isSoftware, holdReason }) => {
      const repository = new InMemoryProcurementStore();
      await run(repository, {
        classifyDocument: async () => ({
          isTor: true,
          torKind: 'final' as const,
          whatThisIs: 'ขอบเขตของงาน',
          analysis: { ...analysis, reason: 'จัดซื้อและติดตั้ง' },
          judgement: { isSoftware, confidence: 'low' as const, reason: 'จัดซื้อและติดตั้ง' },
          readMode: 'pdf' as const,
        }),
      });

      const record = await repository.get('66059313551');
      expect(record?.outcome).toBe('needs_review');
      expect(record?.state).toBe('Completed');
      expect(record?.holdReason).toBe(holdReason);
      expect(record?.analysis?.reason).toBe('จัดซื้อและติดตั้ง');
    },
  );

  test('a held TOR is counted as held, not as analysed', async () => {
    const result = await run(new InMemoryProcurementStore(), {
      classifyDocument: async () => ({
        isTor: true,
        torKind: 'final' as const,
        whatThisIs: 'ขอบเขตของงาน',
        analysis,
        judgement: { ...judgement, confidence: 'low' as const },
        readMode: 'pdf' as const,
      }),
    });

    expect(result).toMatchObject({ torAnalysed: 0, held: 1, dropped: 0 });
  });

  test('a record that leaves review no longer carries a hold reason', async () => {
    const repository = new InMemoryProcurementStore();
    await run(repository, {
      classifyDocument: async () => ({
        isTor: true,
        torKind: 'final' as const,
        whatThisIs: 'ขอบเขตของงาน',
        analysis,
        judgement: { ...judgement, confidence: 'low' as const },
        readMode: 'pdf' as const,
      }),
    });
    expect((await repository.get('66059313551'))?.holdReason).toBe('ai_low_confidence');

    await repository.transition('66059313551', 'queued');

    expect((await repository.get('66059313551'))?.holdReason).toBeNull();
  });
});

describe('the analysis pool', () => {
  const four = ['A', 'B', 'C', 'D'].map((letter) =>
    extracted({ member: `Attach_TOR_${letter}.pdf`, filename: `Attach_TOR_${letter}.pdf` }),
  );

  test('reads at most two PDFs of an archive at once, and keeps their order', async () => {
    const repository = new InMemoryProcurementStore();
    let inFlight = 0;
    let peak = 0;
    const seen: string[] = [];

    await run(repository, {
      extractTorPdfs: () => ({
        torFiles: four,
        members: four.map((pdf) => pdf.member),
        unsafeSkipped: [],
      }),
      classifyDocument: async (pdf) => {
        inFlight += 1;
        peak = Math.max(peak, inFlight);
        seen.push(pdf.byteLength.toString());
        await new Promise((resolve) => setTimeout(resolve, 5));
        inFlight -= 1;
        return {
          isTor: false,
          torKind: null,
          whatThisIs: 'ไม่ใช่ TOR',
          analysis: null,
          judgement: null,
        };
      },
    });

    expect(peak).toBe(2);
    const record = await repository.get('66059313551');
    expect(record?.documents.map((document) => document.filename)).toEqual(
      four.map((pdf) => pdf.filename),
    );
  });

  test('downloads stay one at a time even though analysis is pooled', async () => {
    const repository = new InMemoryProcurementStore();
    let downloading = 0;
    let peak = 0;

    await run(repository, {
      discoverProjects: async () => ({
        records: [1, 2, 3].map((n) => procurement({ projectId: `6605931355${n}` })),
        notEBidding: 0,
        tombstoned: 0,
        truncated: 0,
        failures: [],
        rateLimited: false,
        cursor: {},
        ranAt: '2026-09-09T00:00:00.000Z',
      }),
      downloadArchive: async () => {
        downloading += 1;
        peak = Math.max(peak, downloading);
        await new Promise((resolve) => setTimeout(resolve, 5));
        downloading -= 1;
        return new Uint8Array([0x50, 0x4b, 0x03, 0x04]);
      },
    });

    expect(peak).toBe(1);
  });
});

describe('the reaper', () => {
  const stuck = (projectId: string, at: string) =>
    procurement({
      projectId,
      state: 'Processing',
      outcome: 'downloading',
      statusHistory: [{ state: 'Processing', outcome: 'downloading', at }],
    });

  test('a record left Processing by a dead run is requeued at the next run, without costing an attempt', async () => {
    const repository = new InMemoryProcurementStore();
    await repository.upsert(stuck('66059313551', '2026-09-01T00:00:00.000Z'));

    // Discovery finds nothing new, so what happens to the record is the reaper's doing.
    await run(repository, {
      discoverProjects: async () => ({
        records: [],
        notEBidding: 0,
        tombstoned: 0,
        truncated: 0,
        failures: [],
        rateLimited: false,
        cursor: {},
        ranAt: '2026-09-09T00:00:00.000Z',
      }),
      resolveZipId: async () => null,
    });

    const record = await repository.get('66059313551');
    const requeued = record?.statusHistory.find((entry) => entry.outcome === 'queued');
    expect(requeued?.detail).toMatch(/stuck/i);
    expect(record?.attempts).toBe(0);
  });

  test('a record that is Processing right now is left alone', async () => {
    const repository = new InMemoryProcurementStore();
    await repository.upsert(stuck('66059313551', new Date().toISOString()));

    await run(repository, {
      discoverProjects: async () => ({
        records: [],
        notEBidding: 0,
        tombstoned: 0,
        truncated: 0,
        failures: [],
        rateLimited: false,
        cursor: {},
        ranAt: '2026-09-09T00:00:00.000Z',
      }),
    });

    const record = await repository.get('66059313551');
    expect(record?.state).toBe('Processing');
    expect(record?.statusHistory).toHaveLength(1);
  });
});

describe('retry policy (ADR-0006)', () => {
  const resetting = {
    resolveZipId: async () => {
      throw new Error('connection reset');
    },
  };

  test('a transport error leaves the record Queued to be tried again, and counts one attempt', async () => {
    const repository = new InMemoryProcurementStore();
    await run(repository, resetting);

    const record = await repository.get('66059313551');
    expect(record?.state).toBe('Queued');
    expect(record?.outcome).toBe('error');
    expect(record?.attempts).toBe(1);
    expect(record?.statusHistory.at(-1)?.detail).toContain('connection reset');
  });

  test('the third failed attempt abandons the record', async () => {
    const repository = new InMemoryProcurementStore();
    await run(repository, resetting);
    await run(repository, resetting);
    expect((await repository.get('66059313551'))?.outcome).toBe('error');

    await run(repository, resetting);

    const record = await repository.get('66059313551');
    expect(record?.state).toBe('Failed');
    expect(record?.outcome).toBe('abandoned');
    expect(record?.attempts).toBe(3);
  });

  test('an abandoned record is not selected again', async () => {
    const repository = new InMemoryProcurementStore();
    const resolve = mock(async () => {
      throw new Error('connection reset');
    });
    for (let i = 0; i < 3; i += 1) await run(repository, { resolveZipId: resolve });
    expect(resolve).toHaveBeenCalledTimes(3);

    await run(repository, { resolveZipId: resolve });

    expect(resolve).toHaveBeenCalledTimes(3);
  });

  test('a rate limit is not an attempt: the record goes back to the queue untouched', async () => {
    const repository = new InMemoryProcurementStore();
    await run(repository, {
      resolveZipId: async () => {
        throw new RateLimitedError('https://process5.gprocurement.go.th/…', 429);
      },
    });

    const record = await repository.get('66059313551');
    expect(record?.state).toBe('Queued');
    expect(record?.outcome).toBe('queued');
    expect(record?.attempts).toBe(0);
  });

  test('a project with no published TOR package stays terminal', async () => {
    const repository = new InMemoryProcurementStore();
    await run(repository, { resolveZipId: async () => null });

    const record = await repository.get('66059313551');
    expect(record?.state).toBe('Failed');
    expect(record?.outcome).toBe('no_tor_package');
    expect(record?.attempts).toBe(0);
  });
});

describe('a record the model drops', () => {
  /** A sweep that answers as discovery does: what has a tombstone is not admitted. */
  const admitting =
    (records: Procurement[]): IngestionDeps['discoverProjects'] =>
    async ({ tombstonedIds }) => {
      const ruledOut = await tombstonedIds(records.map((record) => record.projectId));
      return {
        records: records.filter((record) => !ruledOut.has(record.projectId)),
        notEBidding: 0,
        tombstoned: ruledOut.size,
        truncated: 0,
        failures: [],
        rateLimited: false,
        cursor: {},
        ranAt: '2026-09-09T00:00:00.000Z',
      };
    };

  const hardware = (): Partial<IngestionDeps> => ({
    discoverProjects: admitting([procurement({ projectName: 'บำรุงรักษาระบบคอมพิวเตอร์' })]),
    classifyDocument: async () => ({
      isTor: true,
      torKind: 'final' as const,
      whatThisIs: 'ขอบเขตของงาน',
      analysis: { ...analysis, promptVersion: '2026-10-01.1' },
      judgement: {
        isSoftware: false,
        confidence: 'high' as const,
        reason: 'จัดซื้อเครื่องคอมพิวเตอร์ 50 เครื่อง',
      },
      readMode: 'pdf' as const,
    }),
  });

  test('is deleted, leaving a small tombstone that says why, by whom, and on which prompt', async () => {
    const repository = new InMemoryProcurementStore();
    await run(repository, hardware());

    expect(await repository.get('66059313551')).toBeUndefined();
    expect(await repository.listTombstones()).toEqual([
      {
        projectId: '66059313551',
        reason: 'ai_not_software',
        evidence: 'จัดซื้อเครื่องคอมพิวเตอร์ 50 เครื่อง',
        promptVersion: '2026-10-01.1',
        decidedAt: expect.any(String),
        decidedBy: null,
        // What the feed said, so a restore can queue it again without a sweep.
        feed: {
          projectName: 'บำรุงรักษาระบบคอมพิวเตอร์',
          deptName: 'กรุงเทพมหานคร',
          deptCode: '0100',
          announceDate: '2026-08-01',
          budgetYear: 2568,
          purchaseMethodName: 'ประกวดราคาอิเล็กทรอนิกส์ (e-bidding)',
        },
      },
    ]);
  });

  test('is counted as dropped, not as analysed', async () => {
    const result = await run(new InMemoryProcurementStore(), hardware());

    expect(result).toMatchObject({ torAnalysed: 0, dropped: 1, held: 0 });
  });

  test('is not admitted again, or fetched again, when a later sweep finds it', async () => {
    const repository = new InMemoryProcurementStore();
    await run(repository, hardware());

    const resolveZipId = mock(async () => 'zip-1');
    await run(repository, { ...hardware(), resolveZipId });

    expect(await repository.get('66059313551')).toBeUndefined();
    expect(resolveZipId).not.toHaveBeenCalled();
  });

  test('comes back through one fresh reading once an administrator restores it', async () => {
    const repository = new InMemoryProcurementStore();
    await run(repository, hardware());

    expect(await repository.removeTombstone('66059313551')).toBe(true);
    expect(await repository.listTombstones()).toEqual([]);
    expect(await repository.removeTombstone('66059313551')).toBe(false);

    await run(repository, { discoverProjects: hardware().discoverProjects });
    expect((await repository.get('66059313551'))?.outcome).toBe('tor_analysed');
  });
});

describe('a run for one project only', () => {
  const ids = ['66059313551', '66059313552', '66059313553'];
  const sweep = () =>
    mock(async () => ({
      records: ids.map((projectId) => procurement({ projectId })),
      notEBidding: 0,
      tombstoned: 0,
      truncated: 0,
      failures: [],
      rateLimited: false,
      cursor: {},
      ranAt: '2026-09-09T00:00:00.000Z',
    }));

  test('sweeps, then reads that project once and leaves the rest of the queue untouched', async () => {
    const repository = new InMemoryProcurementStore();
    const resolveZipId = mock(async (_projectId: string) => 'zip-1');

    const result = await runIngestion(
      repository,
      { logger, onlyProject: '66059313552' },
      deps({ discoverProjects: sweep(), resolveZipId }),
    );

    expect(resolveZipId).toHaveBeenCalledTimes(1);
    expect(resolveZipId.mock.calls[0]?.[0]).toBe('66059313552');
    expect(result.attempted).toBe(1);
    expect((await repository.get('66059313552'))?.outcome).toBe('tor_analysed');
    expect((await repository.get('66059313551'))?.outcome).toBe('queued');
    expect((await repository.get('66059313553'))?.outcome).toBe('queued');
  });

  test('a project the sweep did not find is reported, not silently skipped, and nothing is fetched', async () => {
    const repository = new InMemoryProcurementStore();
    const resolveZipId = mock(async (_projectId: string) => 'zip-1');

    const result = await runIngestion(
      repository,
      { logger, onlyProject: '99999999999' },
      deps({ discoverProjects: sweep(), resolveZipId }),
    );

    expect(resolveZipId).not.toHaveBeenCalled();
    expect(result.attempted).toBe(0);
    expect(result.failures).toEqual([
      expect.objectContaining({ projectId: '99999999999', stage: 'discovery' }),
    ]);
    expect(await repository.listFailures()).toHaveLength(1);
  });
});

describe('two runners sharing the site', () => {
  const ids = ['66059313551', '66059313552', '66059313553', '66059313554'];
  const many = (): Partial<IngestionDeps> => ({
    discoverProjects: async () => ({
      records: ids.map((projectId) => procurement({ projectId })),
      notEBidding: 0,
      tombstoned: 0,
      truncated: 0,
      failures: [],
      rateLimited: false,
      cursor: {},
      ranAt: '2026-09-09T00:00:00.000Z',
    }),
  });
  const runWith = (
    repository: InMemoryProcurementStore,
    runners: number,
    overrides: Partial<IngestionDeps>,
  ) => runIngestion(repository, { logger, runners }, deps({ ...many(), ...overrides }));
  const tick = () => new Promise((resolve) => setTimeout(resolve, 5));

  test('never has more than one request to the site in flight, while the model reads in parallel', async () => {
    let siteInFlight = 0;
    let maxSite = 0;
    let reading = 0;
    let maxReading = 0;
    const site = async <T>(value: T): Promise<T> => {
      siteInFlight += 1;
      maxSite = Math.max(maxSite, siteInFlight);
      await tick();
      siteInFlight -= 1;
      return value;
    };

    const repository = new InMemoryProcurementStore();
    await runWith(repository, 2, {
      resolveZipId: () => site('zip-1'),
      downloadArchive: () => site(new Uint8Array([0x50, 0x4b, 0x03, 0x04])),
      classifyDocument: async () => {
        reading += 1;
        maxReading = Math.max(maxReading, reading);
        // Longer than the other runner's two site requests, so the readings must overlap.
        await tick();
        await tick();
        await tick();
        reading -= 1;
        return {
          isTor: true,
          torKind: 'final' as const,
          whatThisIs: 'ขอบเขตของงาน',
          analysis,
          judgement,
          readMode: 'pdf' as const,
        };
      },
    });

    expect(maxSite).toBe(1);
    expect(maxReading).toBe(2);
    for (const id of ids) expect((await repository.get(id))?.outcome).toBe('tor_analysed');
  });

  test('a refusal from the site stops both runners at once and leaves the rest queued', async () => {
    let siteCalls = 0;
    const repository = new InMemoryProcurementStore();

    const result = await runWith(repository, 2, {
      resolveZipId: async () => {
        siteCalls += 1;
        await tick();
        throw new RateLimitedError('https://site.test/x', 429);
      },
    });

    // One request made, one refusal; the second runner never reached the site.
    expect(siteCalls).toBe(1);
    expect(result.aborted).toBe(true);
    for (const id of ids) expect((await repository.get(id))?.outcome).toBe('queued');
    // The refusal is logged once, and the second runner's stop is not a second failure.
    expect(result.failures.filter((failure) => failure.stage === 'info')).toHaveLength(1);
    expect(result.failed).toBe(1);
  });
});

describe('a Run over a long queue', () => {
  test('works through all of it: there is no cap on how many records a Run takes', async () => {
    const repository = new InMemoryProcurementStore();
    const total = 240; // far past any page size or former cap
    for (let i = 0; i < total; i += 1) {
      await repository.upsert(procurement({ projectId: String(66000000000 + i) }));
    }
    const resolveZipId = mock(async (_projectId: string) => 'zip-1');

    const result = await runIngestion(
      repository,
      { logger },
      deps({
        resolveZipId,
        discoverProjects: async () => ({
          records: [],
          notEBidding: 0,
          tombstoned: 0,
          truncated: 0,
          failures: [],
          rateLimited: false,
          cursor: {},
          ranAt: '2026-09-09T00:00:00.000Z',
        }),
      }),
    );

    expect(resolveZipId).toHaveBeenCalledTimes(total);
    expect(result.attempted).toBe(total);
  }, 30_000);
});

describe('a Run an administrator stops', () => {
  test('takes no further record once asked, reports why, and leaves the rest queued', async () => {
    const repository = new InMemoryProcurementStore();
    for (const id of ['1', '2', '3']) await repository.upsert(procurement({ projectId: id }));
    let stop = false;
    const seen: string[] = [];

    const result = await runIngestion(
      repository,
      { logger, stopRequested: () => stop },
      deps({
        resolveZipId: async (projectId: string) => {
          seen.push(projectId);
          stop = true; // asked while the first record is in flight
          return null;
        },
        discoverProjects: async () => ({
          records: [],
          notEBidding: 0,
          tombstoned: 0,
          truncated: 0,
          failures: [],
          rateLimited: false,
          cursor: {},
          ranAt: '2026-09-09T00:00:00.000Z',
        }),
      }),
    );

    expect(seen).toHaveLength(1);
    expect(result.stopped).toBe('admin');
    expect((await repository.get(seen[0]!))?.outcome).toBe('no_tor_package');
    expect(result.attempted).toBe(1);
  });

  test('a Run nobody stopped says so', async () => {
    const result = await run(new InMemoryProcurementStore());

    expect(result.stopped).toBeNull();
  });
});

describe('runIngestion: the bid deadline', () => {
  const invitationDocument = {
    member: 'annoudoc_1_66059313551.pdf',
    filename: 'annoudoc_1_66059313551.pdf',
    bytes: 100,
    namePattern: 'unlabelled' as const,
    role: 'invitation' as const,
    note: 'ประกาศเชิญชวน',
  };
  const invited = (bidAt: string | null) => ({
    readInvitation: async () => ({ documents: [invitationDocument], bidAt }),
  });

  test('is the invitation’s bid date, and the invitation joins the manifest', async () => {
    const repository = new InMemoryProcurementStore();
    await run(repository, invited('2026-10-20T09:30:00.000Z'));

    const record = await repository.get('66059313551');
    expect(record?.deadlineAt).toBe('2026-10-20T09:30:00.000Z');
    expect(record?.deadlineSource).toBe('invitation');
    expect(record?.documents.map((d) => d.role)).toEqual(['main_tor', 'invitation']);
  });

  test('is the TOR’s when the invitation states none', async () => {
    const repository = new InMemoryProcurementStore();
    await run(repository, invited(null));

    const record = await repository.get('66059313551');
    expect(record?.deadlineAt).toBe('2026-10-15');
    expect(record?.deadlineSource).toBe('tor');
  });

  test('a weaker source read later does not displace a better one already stored', async () => {
    const repository = new InMemoryProcurementStore();
    await run(repository, {
      discoverProjects: async () => ({
        ...(await deps().discoverProjects(sweepContext)),
        records: [
          procurement({ deadlineAt: '2026-10-20T09:30:00.000Z', deadlineSource: 'invitation' }),
        ],
      }),
    });

    const record = await repository.get('66059313551');
    expect(record?.deadlineAt).toBe('2026-10-20T09:30:00.000Z');
    expect(record?.deadlineSource).toBe('invitation');
  });

  test('is still found for a project whose archive holds no TOR', async () => {
    const repository = new InMemoryProcurementStore();
    await run(repository, {
      ...invited('2026-10-20T09:30:00.000Z'),
      extractTorPdfs: () => ({ torFiles: [], members: ['annoudoc_1.pdf'], unsafeSkipped: [] }),
    });

    const record = await repository.get('66059313551');
    expect(record?.outcome).toBe('no_tor_in_archive');
    expect(record?.deadlineAt).toBe('2026-10-20T09:30:00.000Z');
  });

  test('is not read for a project the model drops as not software', async () => {
    const repository = new InMemoryProcurementStore();
    const readInvitation = mock(async () => ({ documents: [invitationDocument], bidAt: null }));
    await run(repository, {
      readInvitation,
      classifyDocument: async () => ({
        isTor: true,
        torKind: 'final' as const,
        whatThisIs: 'ขอบเขตของงาน',
        analysis,
        judgement: { isSoftware: false, confidence: 'high' as const, reason: 'ก่อสร้าง' },
        readMode: 'pdf' as const,
      }),
    });

    expect(readInvitation).not.toHaveBeenCalled();
    expect(await repository.get('66059313551')).toBeUndefined();
  });
});

describe('runIngestion: the timeline', () => {
  const NEW = '66059313551';
  const row = (announceType: string, announceDate: string | null = null) => ({
    announceType,
    announceDate,
  });
  const noSweep = async () => ({
    ...(await deps().discoverProjects(sweepContext)),
    records: [],
  });
  const invitationDocument = {
    member: `annoudoc_1_${NEW}.pdf`,
    filename: `annoudoc_1_${NEW}.pdf`,
    bytes: 100,
    namePattern: 'unlabelled' as const,
    role: 'invitation' as const,
    note: 'ประกาศเชิญชวน',
  };

  /** A project already read: invited on 20 Sep, TOR analysed, last looked at on 1 Oct. */
  const read = (overrides: Partial<Procurement> = {}) =>
    procurement({
      projectId: '66059313599',
      state: 'Completed',
      outcome: 'tor_analysed',
      status: 'open',
      milestones: { ...EMPTY_MILESTONES, invited: { at: '2026-09-20T00:00:00.000Z' } },
      timelineCheckedAt: '2026-10-01T00:00:00.000Z',
      analysis: { ...analysis, deadlineAt: null },
      documents: [invitationDocument],
      deadlineAt: '2026-10-25T00:00:00.000Z',
      deadlineSource: 'invitation',
      updatedAt: '2026-10-01T00:00:00.000Z',
      ...overrides,
    });
  const READ_TIMELINE = [row('D0', '2026-09-20T02:00:00.000Z')];

  /** Records the archive-side work so a test can say what was not done. */
  function watch() {
    const calls = { zip: [] as string[], download: 0, classify: 0, invitation: 0 };
    return {
      calls,
      deps: {
        resolveZipId: async (projectId: string) => {
          calls.zip.push(projectId);
          return 'zip-1';
        },
        downloadArchive: async () => {
          calls.download += 1;
          return new Uint8Array([0x50, 0x4b]);
        },
        classifyDocument: async () => {
          calls.classify += 1;
          return {
            isTor: true,
            torKind: 'final' as const,
            whatThisIs: '',
            analysis,
            judgement,
            readMode: 'pdf' as const,
          };
        },
        readInvitation: async () => {
          calls.invitation += 1;
          return { documents: [invitationDocument], bidAt: '2026-10-30T00:00:00.000Z' };
        },
      },
    };
  }

  describe('for a project not yet read', () => {
    test('is read before anything else is asked of the site, and sets status and milestones', async () => {
      const repository = new InMemoryProcurementStore();
      const order: string[] = [];
      const announcements = fakeAnnouncements({
        [NEW]: [row('BOQ', '2026-08-01T02:00:00.000Z'), row('D0', '2026-08-10T02:00:00.000Z')],
      });
      const timeline = announcements.timeline.bind(announcements);
      announcements.timeline = async (id, signal) => {
        order.push('timeline');
        return timeline(id, signal);
      };

      await run(repository, {
        announcements,
        resolveZipId: async () => {
          order.push('zip');
          return 'zip-1';
        },
      });

      expect(order).toEqual(['timeline', 'zip']);
      const record = await repository.get(NEW);
      expect(record).toMatchObject({
        status: 'open',
        milestones: {
          drafted: { at: '2026-08-01T00:00:00.000Z' },
          invited: { at: '2026-08-10T00:00:00.000Z' },
        },
      });
      expect(record?.timelineCheckedAt).toMatch(/^\d{4}-/);
      expect(record?.outcome).toBe('tor_analysed');
    });

    test('the bidding date beats the invitation and the TOR for the deadline', async () => {
      const repository = new InMemoryProcurementStore();

      await run(repository, {
        announcements: fakeAnnouncements({ [NEW]: [row('price', '2026-10-02T02:00:00.000Z')] }),
        readInvitation: async () => ({ documents: [], bidAt: '2026-10-20T09:30:00.000Z' }),
      });

      const record = await repository.get(NEW);
      expect(record).toMatchObject({
        status: 'evaluating',
        deadlineAt: '2026-10-02T00:00:00.000Z',
        deadlineSource: 'timeline',
      });
    });

    test('a timeline e-GP will not give is logged, and the record is still retrieved with no stage', async () => {
      const repository = new InMemoryProcurementStore();

      const result = await run(repository, { announcements: fakeAnnouncements({ [NEW]: null }) });

      expect(result.failures).toMatchObject([{ projectId: NEW, stage: 'timeline' }]);
      expect(await repository.get(NEW)).toMatchObject({
        milestones: EMPTY_MILESTONES,
        timelineCheckedAt: null,
        outcome: 'tor_analysed',
      });
    });

    test('a code it does not know is logged and changes nothing', async () => {
      const repository = new InMemoryProcurementStore();

      const result = await run(repository, {
        announcements: fakeAnnouncements({
          [NEW]: [
            row('D0', '2026-08-10T02:00:00.000Z'),
            row('explain', '2026-08-12T02:00:00.000Z'),
          ],
        }),
      });

      expect(result.failures).toHaveLength(1);
      expect(result.failures[0]).toMatchObject({ projectId: NEW, stage: 'timeline' });
      expect(result.failures[0]?.error).toContain('explain');
      expect((await repository.get(NEW))?.status).toBe('open');
    });

    test('an error reading the timeline is a transport failure, costing an attempt like any other', async () => {
      const repository = new InMemoryProcurementStore();
      const announcements = fakeAnnouncements();
      announcements.timeline = async () => {
        throw new Error('connection reset');
      };

      await run(repository, { announcements });

      expect(await repository.get(NEW)).toMatchObject({ outcome: 'error', attempts: 1 });
    });
  });

  describe('for a project already read', () => {
    const refresh = async (
      repository: InMemoryProcurementStore,
      timelines: Record<string, AnnouncementRow[] | null>,
      extra: Partial<IngestionDeps> = {},
    ) =>
      run(repository, {
        discoverProjects: noSweep,
        announcements: fakeAnnouncements(timelines),
        ...extra,
      });

    test('an unchanged timeline costs no archive or model call, and only the check time moves', async () => {
      const repository = new InMemoryProcurementStore();
      await repository.upsert(read());
      const { calls, deps: archive } = watch();

      await refresh(repository, { '66059313599': READ_TIMELINE }, archive);

      expect(calls).toEqual({ zip: [], download: 0, classify: 0, invitation: 0 });
      const record = await repository.get('66059313599');
      expect(record?.timelineCheckedAt).not.toBe('2026-10-01T00:00:00.000Z');
      expect(record?.updatedAt).toBe('2026-10-01T00:00:00.000Z');
      expect(record?.outcome).toBe('tor_analysed');
    });

    test('a stage reached since is recorded without any archive or model call', async () => {
      const repository = new InMemoryProcurementStore();
      await repository.upsert(read());
      const { calls, deps: archive } = watch();

      await refresh(
        repository,
        { '66059313599': [...READ_TIMELINE, row('W0', '2026-10-10T02:00:00.000Z')] },
        archive,
      );

      expect(calls).toEqual({ zip: [], download: 0, classify: 0, invitation: 0 });
      const record = await repository.get('66059313599');
      expect(record).toMatchObject({
        status: 'awarded',
        outcome: 'tor_analysed',
        milestones: { awarded: { at: '2026-10-10T00:00:00.000Z' } },
      });
      expect(record?.updatedAt).not.toBe('2026-10-01T00:00:00.000Z');
    });

    test('a re-dated invitation re-reads the invitation and nothing else', async () => {
      const repository = new InMemoryProcurementStore();
      await repository.upsert(read());
      const { calls, deps: archive } = watch();

      await refresh(
        repository,
        { '66059313599': [row('D0', '2026-09-27T02:00:00.000Z')] },
        archive,
      );

      expect(calls).toEqual({ zip: ['66059313599'], download: 1, classify: 0, invitation: 1 });
      const record = await repository.get('66059313599');
      expect(record).toMatchObject({
        deadlineAt: '2026-10-30T00:00:00.000Z',
        deadlineSource: 'invitation',
        outcome: 'tor_analysed',
        milestones: { invited: { at: '2026-09-27T00:00:00.000Z' } },
      });
      expect(record?.documents.map((d) => d.role)).toEqual(['invitation']);
      expect(record?.analysis).toEqual({ ...analysis, deadlineAt: null });
    });

    test('a re-dated invitation that cannot be re-read keeps the old date, so the next Run tries again', async () => {
      const repository = new InMemoryProcurementStore();
      await repository.upsert(read());
      const { calls, deps: archive } = watch();
      const redated = { '66059313599': [row('D0', '2026-09-27T02:00:00.000Z')] };

      await refresh(repository, redated, {
        ...archive,
        readInvitation: async () => {
          throw new Error('model unavailable');
        },
      });
      expect((await repository.get('66059313599'))?.milestones.invited).toEqual({
        at: '2026-09-20T00:00:00.000Z',
      });

      await refresh(repository, redated, archive);
      expect(calls.invitation).toBe(1);
      expect(await repository.get('66059313599')).toMatchObject({
        deadlineAt: '2026-10-30T00:00:00.000Z',
        milestones: { invited: { at: '2026-09-27T00:00:00.000Z' } },
      });
    });

    test('a code it does not know, published since the last check, is logged once', async () => {
      const repository = new InMemoryProcurementStore();
      await repository.upsert(read());
      const timeline = {
        '66059313599': [...READ_TIMELINE, row('explain', '2026-10-03T02:00:00.000Z')],
      };

      const first = await refresh(repository, timeline);
      const second = await refresh(repository, timeline);

      expect(first.failures).toMatchObject([{ projectId: '66059313599', stage: 'timeline' }]);
      expect(first.failures[0]?.error).toContain('explain');
      expect(second.failures).toEqual([]);
    });

    test('a timeline e-GP will not give leaves the record as it was, and says so', async () => {
      const repository = new InMemoryProcurementStore();
      await repository.upsert(read());
      const before = await repository.get('66059313599');

      const result = await refresh(repository, { '66059313599': null });

      expect(await repository.get('66059313599')).toEqual(before!);
      expect(result.failures).toMatchObject([{ projectId: '66059313599', stage: 'timeline' }]);
    });

    test('a contracted project is never read again', async () => {
      const repository = new InMemoryProcurementStore();
      await repository.upsert(read({ status: 'contracted' }));
      const announcements = fakeAnnouncements({}, READ_TIMELINE);

      await run(repository, { discoverProjects: noSweep, announcements });

      expect(announcements.calls).toEqual([]);
    });

    test('a project still Queued is retrieved, not refreshed', async () => {
      const repository = new InMemoryProcurementStore();
      const { calls, deps: archive } = watch();

      await run(repository, archive);

      expect(calls.classify).toBe(1);
    });
  });

  describe('the order of work', () => {
    test('new projects come first, then the read ones with the oldest check first', async () => {
      const repository = new InMemoryProcurementStore();
      await repository.upsert(
        read({ projectId: 'stale', timelineCheckedAt: '2026-09-01T00:00:00.000Z' }),
      );
      await repository.upsert(
        read({ projectId: 'fresh', timelineCheckedAt: '2026-10-02T00:00:00.000Z' }),
      );
      await repository.upsert(read({ projectId: 'never', timelineCheckedAt: null }));
      const announcements = fakeAnnouncements({}, []);

      await run(repository, { announcements });

      expect(announcements.calls).toEqual([NEW, 'never', 'stale', 'fresh']);
    });

    test('a run for one project does not refresh the others', async () => {
      const repository = new InMemoryProcurementStore();
      await repository.upsert(read());
      const announcements = fakeAnnouncements({}, []);

      await runIngestion(repository, { logger, onlyProject: NEW }, deps({ announcements }));

      expect(announcements.calls).toEqual([NEW]);
    });

    test('a refusal on the timeline stops the run, leaving what was not reached to lead the next', async () => {
      const repository = new InMemoryProcurementStore();
      await repository.upsert(
        read({ projectId: 'a', timelineCheckedAt: '2026-09-01T00:00:00.000Z' }),
      );
      await repository.upsert(
        read({ projectId: 'b', timelineCheckedAt: '2026-09-02T00:00:00.000Z' }),
      );
      const announcements = fakeAnnouncements({}, []);
      announcements.timeline = async (id) => {
        announcements.calls.push(id);
        throw new RateLimitedError('https://process5.gprocurement.go.th/…', 429);
      };

      const result = await run(repository, { discoverProjects: noSweep, announcements });

      expect(result.aborted).toBe(true);
      expect(announcements.calls).toEqual(['a']);
      // The refused project is left exactly as it was, not requeued or counted as failed work.
      expect(await repository.get('a')).toMatchObject({
        outcome: 'tor_analysed',
        attempts: 0,
        timelineCheckedAt: '2026-09-01T00:00:00.000Z',
      });
      expect((await repository.get('b'))?.timelineCheckedAt).toBe('2026-09-02T00:00:00.000Z');
    });

    test('a refusal while a new project is being read puts it back untouched', async () => {
      const repository = new InMemoryProcurementStore();
      const announcements = fakeAnnouncements({}, []);
      announcements.timeline = async () => {
        throw new RateLimitedError('https://process5.gprocurement.go.th/…', 429);
      };

      const result = await run(repository, { announcements });

      expect(result.aborted).toBe(true);
      expect(await repository.get(NEW)).toMatchObject({ outcome: 'queued', attempts: 0 });
    });
  });
});

describe('progress reported while a run works', () => {
  test('shows each record in flight at the stage it is in, and what is left in the queue', async () => {
    const repository = new InMemoryProcurementStore();
    let latest = null as RunProgress | null;
    const seen: RunProgress[] = [];
    const watched = (inside: string) => () => {
      if (latest) seen.push({ ...latest, inFlight: latest.inFlight.map((work) => ({ ...work })) });
      return inside;
    };

    await runIngestion(
      repository,
      {
        logger,
        onProgress: (progress) => {
          latest = progress;
        },
      },
      deps({
        discoverProjects: async () => ({
          records: [
            procurement({ projectId: 'a', announceDate: '2026-08-02' }),
            procurement({ projectId: 'b', projectName: 'ระบบบัญชี', announceDate: '2026-08-01' }),
          ],
          notEBidding: 0,
          tombstoned: 0,
          truncated: 0,
          failures: [],
          rateLimited: false,
          cursor: {},
          ranAt: '2026-09-09T00:00:00.000Z',
        }),
        resolveZipId: async () => watched('zip-1')(),
        classifyDocument: async () => {
          watched('')();
          return {
            isTor: true,
            torKind: 'final',
            whatThisIs: 'ขอบเขตของงาน',
            analysis,
            judgement,
            readMode: 'pdf' as const,
          };
        },
      }),
    );

    expect(seen.map(({ inFlight, queueRemaining }) => ({ inFlight, queueRemaining }))).toEqual([
      {
        inFlight: [
          expect.objectContaining({ slot: 0, projectId: 'a', stage: 'info', fresh: true }),
        ],
        queueRemaining: 1,
      },
      {
        inFlight: [expect.objectContaining({ projectId: 'a', stage: 'analysis' })],
        queueRemaining: 1,
      },
      {
        inFlight: [
          expect.objectContaining({ projectId: 'b', projectName: 'ระบบบัญชี', stage: 'info' }),
        ],
        queueRemaining: 0,
      },
      {
        inFlight: [expect.objectContaining({ projectId: 'b', stage: 'analysis' })],
        queueRemaining: 0,
      },
    ]);
    expect(latest).toEqual({ inFlight: [], queueRemaining: 0 });
  });
});
