import { describe, expect, mock, test } from 'bun:test';
import { currentDeadline, EMPTY_STAGES, EMPTY_TIMELINE, type Procurement } from '@torfun/types';
import {
  fakeAnnouncements,
  SAMPLE_DETAIL,
  SAMPLE_PROCUREMENT_DETAIL,
} from '../../testing/announcement-client';
import { InMemoryProcurementStore } from '../../testing/procurement-store';
import { RateLimitedError, SiteUnavailableError, UnreachableError, UpstreamError } from './client';
import { E_BIDDING_METHOD, FEED_BACKFILL_REQUESTS_PER_RUN } from './constants';
import type { AnnouncementFeed } from './announcement-feed';
import { discoverProjects, type DiscoveryResult, type SweepContext } from './discovery';
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
    detailReadAt: '2026-09-01T00:00:00.000Z',
    announceDate: '2026-08-01',
    purchaseMethodName: 'ประกวดราคาอิเล็กทรอนิกส์ (e-bidding)',
    projectMoney: 5_000_000,
    priceBuild: null,
    state: 'Queued',
    outcome: 'queued',
    attempts: 0,
    holdReason: null,
    statusHistory: [],
    analysis: null,
    discoveredAt: '2026-09-09T00:00:00.000Z',
    timeline: { ...EMPTY_TIMELINE, status: 'open' },
    approved: null,
    archive: null,
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
  site: (_tier, call) => call(),
  cursor: {},
  tombstonedIds: async () => new Set(),
  today: '2026-09-09',
  save: async () => {},
};

/** Every stage stubbed to the happy path; each test overrides what it is about. */
function deps(overrides: Partial<IngestionDeps> = {}): IngestionDeps {
  return {
    discoverProjects: async () => ({
      records: [procurement()],
      notEBidding: 0,
      tombstoned: 0,
      truncated: 0,
      drafts: [],
      failures: [],
      rateLimited: false,
      unreachable: false,
      complete: true,
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
      record?.archive?.documents.find(
        (d: { role: string; filename: string }) => d.role === 'main_tor',
      )?.filename,
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
    expect(record?.archive?.documents[0]?.role).toBe('not_tor');
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
    expect(record?.archive?.documents[0]?.role).toBe('unreadable');
    expect(record?.archive?.zipId).toBe('zip-1');
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

  test('batches a sweep saves on the way are stored once, and their counts add up', async () => {
    const repository = new InMemoryProcurementStore();
    const second = procurement({ projectId: '66059313552' });
    const result = await run(repository, {
      discoverProjects: async (context) => {
        await context.save({ records: [procurement()], drafts: [], failures: [], cursor: {} });
        await context.save({ records: [second], drafts: [], failures: [], cursor: {} });
        return {
          records: [procurement(), second],
          notEBidding: 0,
          tombstoned: 0,
          truncated: 0,
          drafts: [],
          failures: [],
          rateLimited: false,
          unreachable: false,
          complete: true,
          cursor: {},
          ranAt: '2026-09-09T00:00:00.000Z',
        };
      },
    });

    expect(result.newRecords).toBe(2);
    expect(result.changedRecords + result.unchangedRecords).toBe(0);
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
        drafts: [],
        failures: [],
        rateLimited: false,
        unreachable: false,
        complete: true,
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
        drafts: [],
        failures: [],
        rateLimited: false,
        unreachable: false,
        complete: true,
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
    expect((await repository.get('66059313551'))?.archive?.torAmbiguous).toBe(true);
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
        drafts: [],
        failures: [],
        rateLimited: false,
        unreachable: false,
        complete: true,
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
    drafts: [],
    cursor: {},
    failures: [],
    rateLimited: false,
    unreachable: false,
    complete: true,
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

  test('a site that stopped answering during discovery ends the Run: no record is retrieved', async () => {
    const repository = await queued();
    const timeline = mock(async () => []);

    const result = await run(repository, {
      discoverProjects: async () => sweepResult({ unreachable: true }),
      announcements: { ...fakeAnnouncements(), timeline },
    });

    expect(result.discoveryStopped).toBe('unreachable');
    expect(result.attempted).toBe(0);
    expect(timeline).not.toHaveBeenCalled();
    expect((await repository.get('66059313551'))?.state).toBe('Queued');
  });

  test('a Run for one project that the site refused does not blame the queue', async () => {
    const repository = await queued();
    const announcements = fakeAnnouncements({}, []);
    announcements.timeline = async () => {
      throw new RateLimitedError('https://process5.gprocurement.go.th/…', 429);
    };

    const result = await runIngestion(
      repository,
      { logger, onlyProject: '66059313551' },
      deps({ announcements }),
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
          unreachable: false,
          complete: true,
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
    expect((await repository.summary()).lastRunAt).toBeNull();

    const result = await run(repository, { discoverProjects: async () => sweepResult() });
    expect(result.discoveryStopped).toBeNull();
    expect((await repository.summary()).lastRunAt).not.toBeNull();
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
    expect(record?.archive?.documents[0]?.namePattern).toBe('unlabelled');
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
    expect(record?.archive?.documents[0]?.readMode).toBe('first_pages');
    expect(record?.archive?.documents[0]?.readNote).toMatch(/30/);
  });
});

describe('a sweep that only re-sees what it already has', () => {
  const sweep = (overrides: Partial<Procurement> = {}) => ({
    discoverProjects: async () => ({
      records: [procurement(overrides)],
      notEBidding: 0,
      tombstoned: 0,
      truncated: 0,
      drafts: [],
      failures: [],
      rateLimited: false,
      unreachable: false,
      complete: true,
      cursor: {},
      ranAt: '2026-09-09T00:00:00.000Z',
    }),
  });

  test('reports what was new, what moved and what did not', async () => {
    const repository = new InMemoryProcurementStore();

    const first = await run(repository, sweep());
    const again = await run(repository, sweep());
    const moved = await run(repository, sweep({ projectName: 'จ้างพัฒนาระบบ (แก้ไข)' }));

    expect([first.newRecords, first.changedRecords, first.unchangedRecords]).toEqual([1, 0, 0]);
    expect([again.newRecords, again.changedRecords, again.unchangedRecords]).toEqual([0, 0, 1]);
    expect([moved.newRecords, moved.changedRecords, moved.unchangedRecords]).toEqual([0, 1, 0]);
  });
});

describe('when discovery runs', () => {
  test('every Run sweeps, however soon after the last: there is no skip (ADR-0020)', async () => {
    const repository = new InMemoryProcurementStore();
    const discover = mock(async (context: SweepContext) => deps().discoverProjects(context));

    await run(repository, { discoverProjects: discover });
    await run(repository, { discoverProjects: discover });

    expect(discover).toHaveBeenCalledTimes(2);
  });

  test('two Runs back to back both read the new days', async () => {
    const repository = new InMemoryProcurementStore();
    const asked: string[] = [];
    const feed: AnnouncementFeed = {
      async day(deptId, type, day) {
        asked.push(`${deptId}:${type}:${day}`);
        return { announced: 0, items: [], withoutId: 0 };
      },
    };
    const sweep = (context: SweepContext) =>
      discoverProjects({ ...context, today: '2026-10-07' }, feed);

    await run(repository, { discoverProjects: sweep });
    const first = asked.filter((key) => key.endsWith('2026-10-07')).length;
    asked.length = 0;
    await run(repository, { discoverProjects: sweep });
    const second = asked.filter((key) => key.endsWith('2026-10-07')).length;

    expect(first).toBeGreaterThan(0);
    expect(second).toBe(first);
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
          drafts: [],
          failures: [],
          rateLimited: false,
          unreachable: false,
          complete: true,
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

    // Stopped, but not refused: the run log must not read it as the site saying no.
    expect(result.aborted).toBe(false);
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
      drafts: [],
      failures: [],
      rateLimited: false,
      unreachable: false,
      complete: true,
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

  test('reads no more PDFs at once than the limit, and keeps their order', async () => {
    const repository = new InMemoryProcurementStore();
    let inFlight = 0;
    let peak = 0;
    const seen: string[] = [];

    await runIngestion(
      repository,
      { logger, analysisConcurrency: 2 },
      deps({
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
      }),
    );

    expect(peak).toBe(2);
    const record = await repository.get('66059313551');
    expect(record?.archive?.documents.map((document) => document.filename)).toEqual(
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
        drafts: [],
        failures: [],
        rateLimited: false,
        unreachable: false,
        complete: true,
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
        drafts: [],
        failures: [],
        rateLimited: false,
        unreachable: false,
        complete: true,
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
        drafts: [],
        failures: [],
        rateLimited: false,
        unreachable: false,
        complete: true,
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
        drafts: [],
        failures: [],
        rateLimited: false,
        unreachable: false,
        complete: true,
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

describe('Discovery reads the procurement detail and admits by category (ADR-0021)', () => {
  /** As Discovery stores it: from the feed alone, with no detail yet. */
  const unread = (overrides: Partial<Procurement> = {}) =>
    procurement({ budgetYear: null, detailReadAt: null, ...overrides });

  /** A feed that lists one project, under `type` only. */
  const feedListing = (projectId: string, type: 'B0' | 'D0'): AnnouncementFeed => ({
    day: async (_deptId, asked) => ({
      announced: asked === type ? 1 : 0,
      items:
        asked === type
          ? [
              {
                projectId,
                title: 'ประกวดราคาจ้างพัฒนาระบบ',
                methodName: E_BIDDING_METHOD,
                announcementName: type === 'B0' ? 'ร่างเอกสารประกวดราคา' : 'ประกาศเชิญชวน',
                announcedOn: null,
              },
            ]
          : [],
      withoutId: 0,
    }),
  });

  /** Every request to the site, in order, by what it asked. */
  const recording = (announcements: ReturnType<typeof fakeAnnouncements>, log: string[]) => {
    const { procurementDetail, projectDetail, commentsCloseAt, timeline } = announcements;
    announcements.procurementDetail = async (id, signal) => {
      log.push('procurementDetail');
      return procurementDetail(id, signal);
    };
    announcements.projectDetail = async (id, signal) => {
      log.push('projectDetail');
      return projectDetail(id, signal);
    };
    announcements.commentsCloseAt = async (id, params, signal) => {
      log.push('commentsCloseAt');
      return commentsCloseAt(id, params, signal);
    };
    announcements.timeline = async (id, signal) => {
      log.push('timeline');
      return timeline(id, signal);
    };
    return announcements;
  };

  test('an out-of-scope project costs exactly one request and never reaches Retrieval', async () => {
    const repository = new InMemoryProcurementStore();
    await repository.upsert(unread());
    const log: string[] = [];
    const announcements = recording(
      fakeAnnouncements(
        {},
        [],
        {},
        {
          procurementDetails: {
            '66059313551': { ...SAMPLE_PROCUREMENT_DETAIL, goodsId: '1008' },
          },
        },
      ),
      log,
    );
    const resolveZipId = mock(async () => 'zip-1');

    const result = await run(repository, { announcements, resolveZipId });

    expect(log).toEqual(['procurementDetail']);
    expect(resolveZipId).not.toHaveBeenCalled();
    expect(result).toMatchObject({ outOfScope: 1, attempted: 0 });
    expect(await repository.get('66059313551')).toMatchObject({
      state: 'Completed',
      outcome: 'out_of_scope',
      goodsId: '1008',
      projectMoney: SAMPLE_PROCUREMENT_DETAIL.projectMoney,
      priceBuild: SAMPLE_PROCUREMENT_DETAIL.priceBuild,
      detailReadAt: expect.any(String),
      budgetYear: null,
    });
  });

  test('a project with no category is admitted, read in one turn, then retrieved', async () => {
    const repository = new InMemoryProcurementStore();
    await repository.upsert(unread());
    const log: string[] = [];
    const announcements = recording(
      fakeAnnouncements(
        {},
        [],
        {},
        {
          procurementDetails: { '66059313551': { ...SAMPLE_PROCUREMENT_DETAIL, goodsId: null } },
        },
      ),
      log,
    );

    const result = await run(repository, { announcements });

    expect(log).toEqual(['procurementDetail', 'projectDetail', 'timeline']);
    expect(result.outOfScope).toBe(0);
    expect(await repository.get('66059313551')).toMatchObject({
      goodsId: null,
      budgetYear: SAMPLE_DETAIL.budgetYear,
      projectMoney: SAMPLE_PROCUREMENT_DETAIL.projectMoney,
      detailReadAt: expect.any(String),
      outcome: 'tor_analysed',
    });
  });

  test('a project the feed lists as a draft gets its comment deadline; an invitation never asks', async () => {
    const swept = async (type: 'B0' | 'D0') => {
      const repository = new InMemoryProcurementStore();
      const log: string[] = [];
      const announcements = recording(
        fakeAnnouncements(
          {},
          [],
          {},
          {
            commentsClose: { '69109238096': '2026-10-26T17:00:00.000Z' },
          },
        ),
        log,
      );
      await run(repository, {
        discoverProjects: (context) => discoverProjects(context, feedListing('69109238096', type)),
        announcements,
      });
      return { log, record: await repository.get('69109238096') };
    };

    const draft = await swept('B0');
    expect(draft.log).toEqual([
      'procurementDetail',
      'projectDetail',
      'commentsCloseAt',
      'timeline',
    ]);
    expect(draft.record?.timeline.commentsCloseAt).toBe('2026-10-26T17:00:00.000Z');

    const invitation = await swept('D0');
    expect(invitation.log).toEqual(['procurementDetail', 'projectDetail', 'timeline']);
    expect(invitation.record?.timeline.commentsCloseAt).toBeNull();
  });

  test('the whole admission is one gate hold, with no pause inside it', async () => {
    const repository = new InMemoryProcurementStore();
    const log: string[] = [];
    const announcements = recording(fakeAnnouncements({}, []), log);

    await run(repository, {
      discoverProjects: (context) => discoverProjects(context, feedListing('69109238096', 'B0')),
      announcements,
      sleep: async () => {
        log.push('pause');
      },
    });

    const from = log.indexOf('procurementDetail');
    expect(log.slice(from - 1, from + 4)).toEqual([
      'pause',
      'procurementDetail',
      'projectDetail',
      'commentsCloseAt',
      'pause',
    ]);
  });

  test('a detail failure spends an attempt, and the project is asked again next Run', async () => {
    const repository = new InMemoryProcurementStore();
    await repository.upsert(unread());
    const failing = fakeAnnouncements({}, []);
    failing.procurementDetail = async () => {
      throw new UpstreamError('HTTP 500');
    };
    const resolveZipId = mock(async () => 'zip-1');

    const first = await run(repository, { announcements: failing, resolveZipId });

    expect(resolveZipId).not.toHaveBeenCalled();
    expect(first.failures).toEqual([
      expect.objectContaining({ projectId: '66059313551', stage: 'discovery', error: 'HTTP 500' }),
    ]);
    expect(await repository.get('66059313551')).toMatchObject({
      state: 'Queued',
      attempts: 1,
      detailReadAt: null,
    });

    const answering = fakeAnnouncements({}, []);
    await run(repository, { announcements: answering });

    expect(answering.procurementDetailCalls).toEqual(['66059313551']);
    expect(await repository.get('66059313551')).toMatchObject({
      detailReadAt: expect.any(String),
      outcome: 'tor_analysed',
    });
  });

  test('data: null leaves the project as it was, with no attempt spent', async () => {
    const repository = new InMemoryProcurementStore();
    await repository.upsert(unread());
    const announcements = fakeAnnouncements(
      {},
      [],
      {},
      {
        procurementDetails: { '66059313551': null },
      },
    );

    const result = await run(repository, { announcements });

    expect(result.failures).toEqual([
      expect.objectContaining({
        projectId: '66059313551',
        error: expect.stringContaining('data: null'),
      }),
    ]);
    expect(announcements.calls).toEqual([]);
    expect(await repository.get('66059313551')).toMatchObject({
      state: 'Queued',
      attempts: 0,
      detailReadAt: null,
    });
  });

  test('a refusal on the detail stops the Run like any other, spending no attempt', async () => {
    const repository = new InMemoryProcurementStore();
    await repository.upsert(unread());
    await repository.upsert(procurement({ projectId: '66059313552' }));
    const announcements = fakeAnnouncements({}, []);
    announcements.procurementDetail = async () => {
      throw new RateLimitedError('https://process5.gprocurement.go.th/…', 429);
    };

    const result = await run(repository, { announcements });

    expect(result.aborted).toBe(true);
    expect(announcements.calls).toEqual([]);
    expect(await repository.get('66059313551')).toMatchObject({
      outcome: 'queued',
      attempts: 0,
      detailReadAt: null,
    });
  });

  test('Retrieval no longer reads the project detail', async () => {
    const repository = new InMemoryProcurementStore();
    await repository.upsert(procurement());
    const announcements = fakeAnnouncements({}, []);

    await run(repository, { announcements });

    expect(announcements.detailCalls).toEqual([]);
    expect(announcements.procurementDetailCalls).toEqual([]);
  });

  test('a one-project Run reads the detail of a project whose detail was never read', async () => {
    const repository = new InMemoryProcurementStore();
    await repository.upsert(unread());
    const announcements = fakeAnnouncements({}, []);

    await runIngestion(repository, { logger, onlyProject: '66059313551' }, deps({ announcements }));

    expect(announcements.procurementDetailCalls).toEqual(['66059313551']);
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
      drafts: [],
      failures: [],
      rateLimited: false,
      unreachable: false,
      complete: true,
      cursor: {},
      ranAt: '2026-09-09T00:00:00.000Z',
    }));

  test('makes no sweep, reads that project once and leaves the rest of the queue untouched', async () => {
    const repository = new InMemoryProcurementStore();
    for (const projectId of ids) await repository.upsert(procurement({ projectId }));
    const resolveZipId = mock(async (_projectId: string) => 'zip-1');
    const discover = sweep();

    const result = await runIngestion(
      repository,
      { logger, onlyProject: '66059313552' },
      deps({ discoverProjects: discover, resolveZipId }),
    );

    expect(discover).not.toHaveBeenCalled();
    expect(resolveZipId).toHaveBeenCalledTimes(1);
    expect(resolveZipId.mock.calls[0]?.[0]).toBe('66059313552');
    expect(result.attempted).toBe(1);
    expect((await repository.get('66059313552'))?.outcome).toBe('tor_analysed');
    expect((await repository.get('66059313551'))?.outcome).toBe('queued');
    expect((await repository.get('66059313553'))?.outcome).toBe('queued');
  });

  test('a project not in the queue is reported, not silently skipped, and nothing is fetched', async () => {
    const repository = new InMemoryProcurementStore();
    for (const projectId of ids) await repository.upsert(procurement({ projectId }));
    const resolveZipId = mock(async (_projectId: string) => 'zip-1');
    const discover = sweep();

    const result = await runIngestion(
      repository,
      { logger, onlyProject: '99999999999' },
      deps({ discoverProjects: discover, resolveZipId }),
    );

    expect(discover).not.toHaveBeenCalled();
    expect(resolveZipId).not.toHaveBeenCalled();
    expect(result.attempted).toBe(0);
    expect(result.failures).toEqual([
      expect.objectContaining({ projectId: '99999999999', stage: 'discovery' }),
    ]);
    expect(await repository.listFailures()).toHaveLength(1);
  });
});

describe('Retrieval and Analysis sharing the Run', () => {
  const ids = ['66059313551', '66059313552', '66059313553', '66059313554'];
  const many = (): Partial<IngestionDeps> => ({
    discoverProjects: async () => ({
      records: ids.map((projectId) => procurement({ projectId })),
      notEBidding: 0,
      tombstoned: 0,
      truncated: 0,
      drafts: [],
      failures: [],
      rateLimited: false,
      unreachable: false,
      complete: true,
      cursor: {},
      ranAt: '2026-09-09T00:00:00.000Z',
    }),
  });
  const runWith = (repository: InMemoryProcurementStore, overrides: Partial<IngestionDeps>) =>
    runIngestion(repository, { logger }, deps({ ...many(), ...overrides }));
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
    await runWith(repository, {
      resolveZipId: () => site('zip-1'),
      downloadArchive: () => site(new Uint8Array([0x50, 0x4b, 0x03, 0x04])),
      classifyDocument: async () => {
        reading += 1;
        maxReading = Math.max(maxReading, reading);
        // Longer than the next record's two site requests, so the readings must overlap.
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

  test('a refusal from the site stops the Run at once and leaves the rest queued', async () => {
    let siteCalls = 0;
    const repository = new InMemoryProcurementStore();

    const result = await runWith(repository, {
      resolveZipId: async () => {
        siteCalls += 1;
        await tick();
        throw new RateLimitedError('https://site.test/x', 429);
      },
    });

    // One request made, one refusal; no other record reached the site.
    expect(siteCalls).toBe(1);
    expect(result.aborted).toBe(true);
    for (const id of ids) expect((await repository.get(id))?.outcome).toBe('queued');
    // The refusal is logged once, and the records not started are not failures.
    expect(result.failures.filter((failure) => failure.stage === 'info')).toHaveLength(1);
    expect(result.failed).toBe(1);
  });
});

describe('the Analysis limit and the waiting room (ADR-0020)', () => {
  const ids = ['66059313551', '66059313552'];
  const pair = ['A', 'B'].map((letter) =>
    extracted({ member: `Attach_TOR_${letter}.pdf`, filename: `Attach_TOR_${letter}.pdf` }),
  );
  const tick = () => new Promise((resolve) => setTimeout(resolve, 3));
  const base = (): Partial<IngestionDeps> => ({
    discoverProjects: async () => ({
      records: ids.map((projectId) => procurement({ projectId })),
      notEBidding: 0,
      tombstoned: 0,
      truncated: 0,
      drafts: [],
      failures: [],
      rateLimited: false,
      unreachable: false,
      complete: true,
      cursor: {},
      ranAt: '2026-09-09T00:00:00.000Z',
    }),
    extractTorPdfs: () => ({
      torFiles: pair,
      members: pair.map((pdf) => pdf.member),
      unsafeSkipped: [],
    }),
  });
  const classified = {
    isTor: true,
    torKind: 'final' as const,
    whatThisIs: 'ขอบเขตของงาน',
    analysis,
    judgement,
    readMode: 'pdf' as const,
  };

  test('never more model calls in flight than the limit, across every archive of the Run', async () => {
    let inFlight = 0;
    let peak = 0;
    const call = async <T>(value: T): Promise<T> => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await tick();
      inFlight -= 1;
      return value;
    };

    const repository = new InMemoryProcurementStore();
    await runIngestion(
      repository,
      { logger, analysisConcurrency: 1 },
      deps({
        ...base(),
        classifyDocument: () => call(classified),
        readInvitation: () => call({ documents: [], bidAt: null }),
      }),
    );

    expect(peak).toBe(1);
    for (const id of ids) expect((await repository.get(id))?.outcome).toBe('tor_analysed');
  });

  test('a full room keeps the next record from the gate until an Archive leaves it', async () => {
    const events: string[] = [];

    const repository = new InMemoryProcurementStore();
    await runIngestion(
      repository,
      { logger, analysisConcurrency: 1 },
      deps({
        ...base(),
        resolveZipId: async (projectId) => {
          events.push(`site ${projectId}`);
          return 'zip-1';
        },
        classifyDocument: async () => {
          // Long enough that the next record would reach the site meanwhile.
          await tick();
          await tick();
          return classified;
        },
        readInvitation: async (_archive, projectId) => {
          await tick();
          events.push(`analysed ${projectId}`);
          return { documents: [], bidAt: null };
        },
      }),
    );

    expect(events).toEqual([
      'site 66059313551',
      'analysed 66059313551',
      'site 66059313552',
      'analysed 66059313552',
    ]);
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
          drafts: [],
          failures: [],
          rateLimited: false,
          unreachable: false,
          complete: true,
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
          drafts: [],
          failures: [],
          rateLimited: false,
          unreachable: false,
          complete: true,
          cursor: {},
          ranAt: '2026-09-09T00:00:00.000Z',
        }),
      }),
    );

    expect(seen).toHaveLength(1);
    expect(result.stopped).toBe('admin');
    expect(result.aborted).toBe(false);
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
    expect(record?.timeline.deadlineAt).toBe('2026-10-20T09:30:00.000Z');
    expect(record?.archive?.documents.map((d) => d.role)).toEqual(['main_tor', 'invitation']);
  });

  test('is the TOR’s when the invitation states none, marked as read by the model', async () => {
    const repository = new InMemoryProcurementStore();
    await run(repository, invited(null));

    const record = await repository.get('66059313551');
    expect(record?.timeline.deadlineAt).toBeNull();
    expect(currentDeadline(record!)).toEqual({ at: '2026-10-15', kind: 'bids', readByModel: true });
  });

  test('a TOR read later does not displace the official date already stored', async () => {
    const repository = new InMemoryProcurementStore();
    await run(repository, {
      discoverProjects: async () => ({
        ...(await deps().discoverProjects(sweepContext)),
        records: [
          procurement({
            timeline: { ...EMPTY_TIMELINE, status: 'open', deadlineAt: '2026-10-20T09:30:00.000Z' },
          }),
        ],
      }),
    });

    const record = await repository.get('66059313551');
    expect(record?.timeline.deadlineAt).toBe('2026-10-20T09:30:00.000Z');
    expect(currentDeadline(record!)).toEqual({
      at: '2026-10-20T09:30:00.000Z',
      kind: 'bids',
      readByModel: false,
    });
  });

  test('is still found for a project whose archive holds no TOR', async () => {
    const repository = new InMemoryProcurementStore();
    await run(repository, {
      ...invited('2026-10-20T09:30:00.000Z'),
      extractTorPdfs: () => ({ torFiles: [], members: ['annoudoc_1.pdf'], unsafeSkipped: [] }),
    });

    const record = await repository.get('66059313551');
    expect(record?.outcome).toBe('no_tor_in_archive');
    expect(record?.timeline.deadlineAt).toBe('2026-10-20T09:30:00.000Z');
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
      timeline: {
        ...EMPTY_TIMELINE,
        status: 'open',
        stages: { ...EMPTY_STAGES, invited: '2026-09-20T00:00:00.000Z' },
        lastReadAt: '2026-10-01T00:00:00.000Z',
        deadlineAt: '2026-10-25T00:00:00.000Z',
      },
      analysis: { ...analysis, deadlineAt: null },
      archive: { zipId: 'zip-1', documents: [invitationDocument], torAmbiguous: false },
      updatedAt: '2026-10-01T00:00:00.000Z',
      ...overrides,
    });
  const lastRead = (projectId: string, lastReadAt: string | null) =>
    read({ projectId, timeline: { ...read().timeline, lastReadAt } });
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
    test('is read before anything else is asked of the site, and sets status and stages', async () => {
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
      expect(record?.timeline).toMatchObject({
        status: 'open',
        stages: { drafted: '2026-08-01T00:00:00.000Z', invited: '2026-08-10T00:00:00.000Z' },
      });
      expect(record?.timeline.lastReadAt).toMatch(/^\d{4}-/);
      expect(record?.outcome).toBe('tor_analysed');
    });

    test('the bidding date beats the invitation and the TOR for the deadline', async () => {
      const repository = new InMemoryProcurementStore();

      await run(repository, {
        announcements: fakeAnnouncements({ [NEW]: [row('price', '2026-10-02T02:00:00.000Z')] }),
        readInvitation: async () => ({ documents: [], bidAt: '2026-10-20T09:30:00.000Z' }),
      });

      const record = await repository.get(NEW);
      expect(record?.timeline).toMatchObject({
        status: 'evaluating',
        deadlineAt: '2026-10-02T00:00:00.000Z',
      });
    });

    test('a timeline e-GP will not give is logged, and the record is still retrieved with no stage', async () => {
      const repository = new InMemoryProcurementStore();

      const result = await run(repository, { announcements: fakeAnnouncements({ [NEW]: null }) });

      expect(result.failures).toMatchObject([{ projectId: NEW, stage: 'timeline' }]);
      expect(await repository.get(NEW)).toMatchObject({
        timeline: { stages: EMPTY_STAGES, lastReadAt: null },
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
      expect((await repository.get(NEW))?.timeline.status).toBe('open');
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
      expect(record?.timeline.lastReadAt).not.toBe('2026-10-01T00:00:00.000Z');
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
        timeline: { status: 'awarded', stages: { awarded: '2026-10-10T00:00:00.000Z' } },
        outcome: 'tor_analysed',
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
        timeline: {
          deadlineAt: '2026-10-30T00:00:00.000Z',
          stages: { invited: '2026-09-27T00:00:00.000Z' },
        },
        outcome: 'tor_analysed',
      });
      expect(record?.archive?.documents.map((d) => d.role)).toEqual(['invitation']);
      expect(record?.analysis).toEqual({ ...analysis, deadlineAt: null });
    });

    test('a re-dated invitation on a project with no archive stored keeps it under the archive it came from', async () => {
      const repository = new InMemoryProcurementStore();
      await repository.upsert(read({ outcome: 'no_tor_package', archive: null }));
      const { deps: archive } = watch();

      await refresh(
        repository,
        { '66059313599': [row('D0', '2026-09-27T02:00:00.000Z')] },
        archive,
      );

      expect((await repository.get('66059313599'))?.archive).toEqual({
        zipId: 'zip-1',
        documents: [invitationDocument],
        torAmbiguous: false,
      });
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
      expect((await repository.get('66059313599'))?.timeline.stages.invited).toBe(
        '2026-09-20T00:00:00.000Z',
      );

      await refresh(repository, redated, archive);
      expect(calls.invitation).toBe(1);
      expect((await repository.get('66059313599'))?.timeline).toMatchObject({
        deadlineAt: '2026-10-30T00:00:00.000Z',
        stages: { invited: '2026-09-27T00:00:00.000Z' },
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
      await repository.upsert(read({ timeline: { ...read().timeline, status: 'contracted' } }));
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

  describe('a refresh and the procurement detail (ADR-0021)', () => {
    const ID = '66059313599';
    const CLOSES = '2026-10-26T17:00:00.000Z';
    const DRAFT_TIMELINE = [row('B0', '2026-10-20T02:00:00.000Z')];
    const withoutDetail = (overrides: Partial<Procurement> = {}) =>
      read({ detailReadAt: null, projectMoney: null, ...overrides });
    const drafting = (overrides: Partial<Procurement> = {}) =>
      read({
        timeline: {
          ...EMPTY_TIMELINE,
          status: 'drafting',
          stages: { ...EMPTY_STAGES, drafted: '2026-10-20T00:00:00.000Z' },
          lastReadAt: '2026-10-21T00:00:00.000Z',
        },
        ...overrides,
      });
    const refreshWith = (
      repository: InMemoryProcurementStore,
      announcements: ReturnType<typeof fakeAnnouncements>,
      extra: Partial<IngestionDeps> = {},
    ) => run(repository, { discoverProjects: noSweep, announcements, ...extra });

    test('an old record costs one extra request once, then never', async () => {
      const repository = new InMemoryProcurementStore();
      await repository.upsert(withoutDetail());

      const first = fakeAnnouncements({ [ID]: READ_TIMELINE });
      await refreshWith(repository, first);

      expect(first.procurementDetailCalls).toEqual([ID]);
      expect(first.detailCalls).toEqual([]);
      expect(first.calls).toEqual([ID]);
      expect(await repository.get(ID)).toMatchObject({
        outcome: 'tor_analysed',
        detailReadAt: expect.any(String),
        goodsId: SAMPLE_PROCUREMENT_DETAIL.goodsId,
        projectMoney: SAMPLE_PROCUREMENT_DETAIL.projectMoney,
        priceBuild: SAMPLE_PROCUREMENT_DETAIL.priceBuild,
        budgetYear: 2568,
      });

      const second = fakeAnnouncements({ [ID]: READ_TIMELINE });
      await refreshWith(repository, second);

      expect(second.procurementDetailCalls).toEqual([]);
      expect(second.calls).toEqual([ID]);
    });

    test('an old record with no budget year has it read in the same turn', async () => {
      const repository = new InMemoryProcurementStore();
      await repository.upsert(withoutDetail({ budgetYear: null }));
      const announcements = fakeAnnouncements({ [ID]: READ_TIMELINE });

      await refreshWith(repository, announcements);

      expect(announcements.detailCalls).toEqual([ID]);
      expect((await repository.get(ID))?.budgetYear).toBe(SAMPLE_DETAIL.budgetYear);
    });

    test('an old record found out of scope stops after the detail, and is never refreshed again', async () => {
      const repository = new InMemoryProcurementStore();
      await repository.upsert(withoutDetail());
      const outside = fakeAnnouncements(
        { [ID]: READ_TIMELINE },
        null,
        {},
        {
          procurementDetails: { [ID]: { ...SAMPLE_PROCUREMENT_DETAIL, goodsId: '1008' } },
        },
      );
      const { calls, deps: archive } = watch();

      const result = await refreshWith(repository, outside, archive);

      expect(outside.procurementDetailCalls).toEqual([ID]);
      expect(outside.calls).toEqual([]);
      expect(calls.zip).toEqual([]);
      expect(result.outOfScope).toBe(1);
      expect(await repository.get(ID)).toMatchObject({
        state: 'Completed',
        outcome: 'out_of_scope',
        goodsId: '1008',
        detailReadAt: expect.any(String),
      });

      const later = fakeAnnouncements({ [ID]: READ_TIMELINE });
      await refreshWith(repository, later);

      expect(later.procurementDetailCalls).toEqual([]);
      expect(later.calls).toEqual([]);
    });

    test('an out_of_scope record is never selected', async () => {
      const repository = new InMemoryProcurementStore();
      await repository.upsert(read({ outcome: 'out_of_scope', analysis: null, archive: null }));
      const announcements = fakeAnnouncements({ [ID]: READ_TIMELINE });

      await refreshWith(repository, announcements);

      expect(announcements.calls).toEqual([]);
      expect(announcements.procurementDetailCalls).toEqual([]);
    });

    test('a drafting record re-reads the comment deadline; an open one does not', async () => {
      const repository = new InMemoryProcurementStore();
      await repository.upsert(drafting());
      const draftAnnouncements = fakeAnnouncements(
        { [ID]: DRAFT_TIMELINE },
        null,
        {},
        {
          commentsClose: { [ID]: CLOSES },
        },
      );

      await refreshWith(repository, draftAnnouncements);

      expect(draftAnnouncements.procurementDetailCalls).toEqual([ID]);
      expect(draftAnnouncements.commentsCalls).toEqual([ID]);
      expect((await repository.get(ID))?.timeline).toMatchObject({
        status: 'drafting',
        commentsCloseAt: CLOSES,
      });

      const openRepository = new InMemoryProcurementStore();
      await openRepository.upsert(read());
      const openAnnouncements = fakeAnnouncements(
        { [ID]: READ_TIMELINE },
        null,
        {},
        {
          commentsClose: { [ID]: CLOSES },
        },
      );

      await refreshWith(openRepository, openAnnouncements);

      expect(openAnnouncements.procurementDetailCalls).toEqual([]);
      expect(openAnnouncements.commentsCalls).toEqual([]);
      expect((await openRepository.get(ID))?.timeline.commentsCloseAt).toBeNull();
    });

    test('an old drafting record reads its detail once and asks the comment deadline with it', async () => {
      const repository = new InMemoryProcurementStore();
      await repository.upsert(drafting({ detailReadAt: null }));
      const announcements = fakeAnnouncements(
        { [ID]: DRAFT_TIMELINE },
        null,
        {},
        {
          commentsClose: { [ID]: CLOSES },
        },
      );

      await refreshWith(repository, announcements);

      expect(announcements.procurementDetailCalls).toEqual([ID]);
      expect(announcements.commentsCalls).toEqual([ID]);
      expect((await repository.get(ID))?.timeline.commentsCloseAt).toBe(CLOSES);
    });

    test('a draft whose detail was read without its feed type gets its comment deadline at the first refresh', async () => {
      const repository = new InMemoryProcurementStore();
      await repository.upsert(procurement({ projectId: ID, budgetYear: null, detailReadAt: null }));

      const admitted = fakeAnnouncements(
        { [ID]: DRAFT_TIMELINE },
        null,
        {},
        {
          commentsClose: { [ID]: CLOSES },
        },
      );
      await refreshWith(repository, admitted);

      expect(admitted.commentsCalls).toEqual([]);
      expect(await repository.get(ID)).toMatchObject({
        outcome: 'tor_analysed',
        timeline: { status: 'drafting', commentsCloseAt: null },
      });

      const refreshed = fakeAnnouncements(
        { [ID]: DRAFT_TIMELINE },
        null,
        {},
        {
          commentsClose: { [ID]: CLOSES },
        },
      );
      await refreshWith(repository, refreshed);

      expect(refreshed.commentsCalls).toEqual([ID]);
      expect((await repository.get(ID))?.timeline.commentsCloseAt).toBe(CLOSES);
    });

    test('a failed detail on a refresh is logged, leaves the record as it was, and is asked again', async () => {
      const repository = new InMemoryProcurementStore();
      await repository.upsert(withoutDetail());
      const failing = fakeAnnouncements({ [ID]: READ_TIMELINE });
      failing.procurementDetail = async () => {
        throw new UpstreamError('HTTP 500');
      };

      const result = await refreshWith(repository, failing);

      expect(result.failures).toEqual([
        expect.objectContaining({ projectId: ID, stage: 'discovery', error: 'HTTP 500' }),
      ]);
      expect(await repository.get(ID)).toMatchObject({
        state: 'Completed',
        outcome: 'tor_analysed',
        detailReadAt: null,
      });

      const answering = fakeAnnouncements({ [ID]: READ_TIMELINE });
      await refreshWith(repository, answering);

      expect(answering.procurementDetailCalls).toEqual([ID]);
      expect((await repository.get(ID))?.detailReadAt).toEqual(expect.any(String));
    });

    test('data: null on a refresh leaves the detail unread, and the timeline is still read', async () => {
      const repository = new InMemoryProcurementStore();
      await repository.upsert(withoutDetail());
      const announcements = fakeAnnouncements(
        { [ID]: READ_TIMELINE },
        null,
        {},
        {
          procurementDetails: { [ID]: null },
        },
      );

      await refreshWith(repository, announcements);

      expect(announcements.calls).toEqual([ID]);
      expect(await repository.get(ID)).toMatchObject({
        outcome: 'tor_analysed',
        detailReadAt: null,
      });
    });

    test('a refusal on a refresh detail stops the Run', async () => {
      const repository = new InMemoryProcurementStore();
      await repository.upsert(withoutDetail());
      const refusing = fakeAnnouncements({ [ID]: READ_TIMELINE });
      refusing.procurementDetail = async () => {
        throw new RateLimitedError('https://site.test/x', 429);
      };

      const result = await refreshWith(repository, refusing);

      expect(result.aborted).toBe(true);
      expect(refusing.calls).toEqual([]);
      expect((await repository.get(ID))?.detailReadAt).toBeNull();
    });
  });

  describe('the order of work', () => {
    test('new projects come first, then the read ones with the oldest check first', async () => {
      const repository = new InMemoryProcurementStore();
      await repository.upsert(lastRead('stale', '2026-09-01T00:00:00.000Z'));
      await repository.upsert(lastRead('fresh', '2026-10-02T00:00:00.000Z'));
      await repository.upsert(lastRead('never', null));
      // Queued before the Run, as Discovery would have left it.
      await repository.upsert(procurement());
      const announcements = fakeAnnouncements({}, []);

      await run(repository, { discoverProjects: noSweep, announcements });

      expect(announcements.calls).toEqual([NEW, 'never', 'stale', 'fresh']);
    });

    test('a run for one project does not refresh the others', async () => {
      const repository = new InMemoryProcurementStore();
      await repository.upsert(read());
      await repository.upsert(procurement());
      const announcements = fakeAnnouncements({}, []);

      await runIngestion(repository, { logger, onlyProject: NEW }, deps({ announcements }));

      expect(announcements.calls).toEqual([NEW]);
    });

    test('a refusal on the timeline stops the run, leaving what was not reached to lead the next', async () => {
      const repository = new InMemoryProcurementStore();
      await repository.upsert(lastRead('a', '2026-09-01T00:00:00.000Z'));
      await repository.upsert(lastRead('b', '2026-09-02T00:00:00.000Z'));
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
        timeline: { lastReadAt: '2026-09-01T00:00:00.000Z' },
      });
      expect((await repository.get('b'))?.timeline.lastReadAt).toBe('2026-09-02T00:00:00.000Z');
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
  test('shows Discovery, the record in its turn and each Archive under Analysis, and what is left in the queue', async () => {
    const repository = new InMemoryProcurementStore();
    const all: RunProgress[] = [];
    const copy = (progress: RunProgress) => ({
      ...progress,
      inFlight: progress.inFlight.map((work) => ({ ...work })),
    });
    const at: Record<string, RunProgress> = {};
    let secondTurn: () => void = () => {};
    const secondReached = new Promise<void>((resolve) => (secondTurn = resolve));

    await runIngestion(
      repository,
      {
        logger,
        onProgress: (progress) => {
          all.push(copy(progress));
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
          drafts: [],
          failures: [],
          rateLimited: false,
          unreachable: false,
          complete: true,
          cursor: {},
          ranAt: '2026-09-09T00:00:00.000Z',
        }),
        resolveZipId: async (projectId) => {
          at[projectId] = all.at(-1)!;
          if (projectId === 'b') secondTurn();
          return 'zip-1';
        },
        classifyDocument: async () => {
          // The first Archive is still being read when the next record takes its turn.
          await secondReached;
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

    expect(all[0]?.inFlight).toEqual([
      expect.objectContaining({ slot: 0, projectId: '-', stage: 'discovery' }),
    ]);
    expect(at['a']).toEqual({
      inFlight: [expect.objectContaining({ slot: 1, projectId: 'a', stage: 'info', fresh: true })],
      queueRemaining: 1,
    });
    expect(at['b']).toEqual({
      inFlight: [
        expect.objectContaining({
          slot: 1,
          projectId: 'b',
          projectName: 'ระบบบัญชี',
          stage: 'info',
        }),
        expect.objectContaining({ slot: 2, projectId: 'a', stage: 'analysis' }),
      ],
      queueRemaining: 0,
    });
    expect(all.at(-1)).toEqual({ inFlight: [], queueRemaining: 0 });
  });
});

describe('runIngestion: the timing log', () => {
  test('the run-complete line says where the time went and what was asked of the site', async () => {
    const lines: Array<{ fields: unknown; message: unknown }> = [];
    const recording = {
      ...logger,
      info: (fields: unknown, message?: unknown) => lines.push({ fields, message }),
    } as typeof logger;
    const repository = new InMemoryProcurementStore();

    await runIngestion(
      repository,
      { logger: recording },
      deps({
        discoverProjects: async (context) => ({
          ...(await deps().discoverProjects(context)),
          requests: { newDays: 4, historyDays: 2 },
        }),
        classifyDocument: async (pdf) => {
          await new Promise((resolve) => setTimeout(resolve, 10));
          return deps().classifyDocument(pdf);
        },
      }),
    );

    const complete = lines.find((line) => line.message === 'egp: run complete');
    const { timing } = complete?.fields as {
      timing: {
        wallMs: number;
        gate: { busyMs: number; pausedMs: number; idleMs: number; holds: number };
        analysisBusyMs: number;
        requests: Record<string, number>;
      };
    };
    expect(timing.requests).toEqual({
      newDays: 4,
      historyDays: 2,
      detailTurns: 0,
      retrievalTurns: 1,
      refreshTurns: 0,
    });
    // The fake discovery asks nothing through the gate, so the one hold is the record's.
    expect(timing.gate.holds).toBe(1);
    expect(timing.analysisBusyMs).toBeGreaterThanOrEqual(5);
    expect(timing.wallMs).toBeGreaterThanOrEqual(timing.analysisBusyMs);
    const { busyMs, pausedMs, idleMs } = timing.gate;
    expect(busyMs + pausedMs + idleMs).toBeLessThanOrEqual(timing.wallMs);
  });
});

describe('a Run that streams Discovery, Retrieval and Analysis (ADR-0020)', () => {
  const TODAY = '2026-10-07';
  const FOUND = '66109000001';
  const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

  /**
   * The real sweep over a fake feed, and every site call written to one log in
   * the order the site would have seen it. The pause is a real (short) wait, so
   * a Retrieval turn and a feed request can both be waiting when the gate frees.
   */
  function streaming(listed: Record<string, string[]> = {}) {
    const log: string[] = [];
    const feed: AnnouncementFeed = {
      async day(deptId, type, day) {
        log.push(`feed ${day === TODAY ? 'new' : 'history'} ${deptId}:${type}:${day}`);
        const ids = listed[`${deptId}:${type}:${day}`] ?? [];
        return {
          announced: ids.length,
          withoutId: 0,
          items: ids.map((projectId) => ({
            projectId,
            title: 'ประกวดราคาจ้างพัฒนาระบบ',
            methodName: E_BIDDING_METHOD,
            announcementName: 'ประกาศเชิญชวน',
            announcedOn: null,
          })),
        };
      },
    };
    const announcements = fakeAnnouncements({}, []);
    const timeline = announcements.timeline;
    announcements.timeline = async (projectId, signal) => {
      log.push(`timeline ${projectId}`);
      return timeline(projectId, signal);
    };
    const overrides: Partial<IngestionDeps> = {
      discoverProjects: (context) => discoverProjects({ ...context, today: TODAY }, feed),
      announcements,
      resolveZipId: async (projectId) => {
        log.push(`zip ${projectId}`);
        return 'zip-1';
      },
      downloadArchive: async () => {
        log.push('download');
        return new Uint8Array([0x50, 0x4b, 0x03, 0x04]);
      },
      sleep: () => wait(1),
    };
    return { log, overrides };
  }

  const history = (log: string[]) => log.filter((line) => line.startsWith('feed history'));

  test('a project found on the first new day is retrieved before the last history day is read', async () => {
    const repository = new InMemoryProcurementStore();
    const { log, overrides } = streaming({ [`0305:D0:${TODAY}`]: [FOUND] });

    await runIngestion(repository, { logger }, deps(overrides));

    const retrieved = log.indexOf(`timeline ${FOUND}`);
    expect(retrieved).toBeGreaterThan(-1);
    expect(retrieved).toBeLessThan(log.lastIndexOf(history(log).at(-1)!));
    expect((await repository.get(FOUND))?.outcome).toBe('tor_analysed');
  }, 20_000);

  test('the Run does not end before Discovery has used its history share', async () => {
    const repository = new InMemoryProcurementStore();
    await repository.upsert(procurement());
    const { log, overrides } = streaming();

    await runIngestion(repository, { logger }, deps(overrides));

    expect(history(log)).toHaveLength(FEED_BACKFILL_REQUESTS_PER_RUN);
    // The queue was done long before; the Run still waited for the sweep.
    expect(log.indexOf('download')).toBeLessThan(log.length - 1);
    expect(log.at(-1)).toStartWith('feed history');
  }, 20_000);

  test('while the model reads, the gate goes on serving Discovery', async () => {
    const repository = new InMemoryProcurementStore();
    await repository.upsert(procurement());
    const { log, overrides } = streaming();

    await runIngestion(
      repository,
      { logger },
      deps({
        ...overrides,
        classifyDocument: async (pdf) => {
          log.push('model start');
          await wait(40);
          log.push('model end');
          return deps().classifyDocument(pdf);
        },
      }),
    );

    const during = log.slice(log.indexOf('model start'), log.indexOf('model end'));
    expect(during.filter((line) => line.startsWith('feed')).length).toBeGreaterThan(3);
  }, 20_000);

  /** Three projects queued before the Run; the first one's Archive is read slowly. */
  async function threeQueued() {
    const repository = new InMemoryProcurementStore();
    for (const projectId of ['q1', 'q2', 'q3']) {
      await repository.upsert(procurement({ projectId, announceDate: `2026-08-0${projectId[1]}` }));
    }
    return repository;
  }
  const slowModel = (log: string[]): Partial<IngestionDeps> => ({
    classifyDocument: async (pdf) => {
      await wait(30);
      log.push('model end');
      return deps().classifyDocument(pdf);
    },
  });
  const order = async (repository: InMemoryProcurementStore) =>
    (await repository.find({ state: 'Queued', limit: 10, offset: 0 })).items.map(
      (record) => record.projectId,
    );

  test('a refusal mid-Run: no further site call, the Archive in hand is still analysed and stored', async () => {
    const repository = await threeQueued();
    const queuedOrder = await order(repository);
    const [first, second, third] = queuedOrder as [string, string, string];
    const { log, overrides } = streaming();
    const timeline = overrides.announcements!.timeline;

    const result = await runIngestion(
      repository,
      { logger },
      deps({
        ...overrides,
        ...slowModel(log),
        announcements: {
          ...overrides.announcements!,
          timeline: async (projectId, signal) => {
            if (projectId === second) {
              log.push(`refused ${projectId}`);
              throw new RateLimitedError('https://process5.gprocurement.go.th/…', 429);
            }
            return timeline(projectId, signal);
          },
        },
      }),
    );

    const refused = log.indexOf(`refused ${second}`);
    expect(refused).toBeGreaterThan(-1);
    // Nothing more was asked of the site; only the model finished its reading.
    expect(log.slice(refused + 1)).toEqual(['model end']);
    expect(result.aborted).toBe(true);
    expect(result.stopped).toBeNull();
    expect(result.discoveryStopped).toBe('rate_limited');
    expect((await repository.get(first))?.outcome).toBe('tor_analysed');
    for (const id of [second, third]) {
      expect(await repository.get(id)).toMatchObject({ state: 'Queued', attempts: 0 });
    }
    expect(log).not.toContain(`timeline ${third}`);
  }, 20_000);

  test('an administrator stop: no further site call, the Archive in hand is stored, and it is not a refusal', async () => {
    const repository = await threeQueued();
    const [first, second, third] = (await order(repository)) as [string, string, string];
    const { log, overrides } = streaming();
    let stop = false;

    const result = await runIngestion(
      repository,
      { logger, stopRequested: () => stop },
      deps({
        ...overrides,
        ...slowModel(log),
        downloadArchive: async () => {
          log.push('download');
          stop = true; // asked while the first record downloads
          return new Uint8Array([0x50, 0x4b, 0x03, 0x04]);
        },
      }),
    );

    const asked = log.indexOf('download');
    expect(log.slice(asked + 1)).toEqual(['model end']);
    expect(result.stopped).toBe('admin');
    expect(result.aborted).toBe(false);
    expect(result.discoveryStopped).toBeNull();
    expect(result.attempted).toBe(1);
    expect((await repository.get(first))?.outcome).toBe('tor_analysed');
    for (const id of [second, third]) {
      expect(await repository.get(id)).toMatchObject({ state: 'Queued', attempts: 0 });
    }
    expect(await repository.listFailures()).toEqual([]);
  }, 20_000);

  test('a refresh whose invitation moved while the room is full waits its turn behind the queue, and does not deadlock', async () => {
    const repository = new InMemoryProcurementStore();
    await repository.upsert(procurement({ projectId: 'new' }));
    await repository.upsert(
      procurement({
        projectId: 'read',
        state: 'Completed',
        outcome: 'tor_analysed',
        timeline: {
          ...EMPTY_TIMELINE,
          status: 'open',
          stages: { ...EMPTY_STAGES, invited: '2026-09-20T00:00:00.000Z' },
          lastReadAt: '2026-10-01T00:00:00.000Z',
          deadlineAt: '2026-10-25T00:00:00.000Z',
        },
      }),
    );
    const log: string[] = [];
    const announcements = fakeAnnouncements(
      { read: [{ announceType: 'D0', announceDate: '2026-09-27T02:00:00.000Z' }] },
      [],
    );
    const timeline = announcements.timeline;
    announcements.timeline = async (projectId, signal) => {
      log.push(`timeline ${projectId}`);
      return timeline(projectId, signal);
    };

    const result = await runIngestion(
      repository,
      // One place: the new project's Archive fills the room while the refresh has its turn.
      { logger, analysisConcurrency: 1 },
      deps({
        discoverProjects: async (context) => ({
          ...(await deps().discoverProjects(context)),
          records: [],
        }),
        announcements,
        downloadArchive: async () => {
          log.push('download');
          return new Uint8Array([0x50, 0x4b, 0x03, 0x04]);
        },
        classifyDocument: async (pdf) => {
          await wait(20);
          log.push('model end');
          return deps().classifyDocument(pdf);
        },
        readInvitation: async (_archive, projectId) => {
          log.push(`invitation ${projectId}`);
          return {
            documents: [],
            bidAt: projectId === 'read' ? '2026-10-30T00:00:00.000Z' : null,
          };
        },
      }),
    );

    expect(log).toEqual([
      'timeline new',
      'download',
      // The room is full: no download now, and nothing written.
      'timeline read',
      'model end',
      'invitation new',
      // Back behind the queue, it took a place before its turn, then fetched.
      'timeline read',
      'download',
      'invitation read',
    ]);
    expect(result.refreshed).toBe(1);
    expect((await repository.get('read'))?.timeline).toMatchObject({
      deadlineAt: '2026-10-30T00:00:00.000Z',
      stages: { invited: '2026-09-27T00:00:00.000Z' },
    });
    expect((await repository.get('new'))?.outcome).toBe('tor_analysed');
  });

  test('a model call that outlives its record deadline keeps its place in the room until it settles', async () => {
    const repository = new InMemoryProcurementStore();
    await repository.upsert(procurement({ projectId: 'a', announceDate: '2026-08-02' }));
    await repository.upsert(procurement({ projectId: 'b', announceDate: '2026-08-01' }));
    const log: string[] = [];
    const announcements = fakeAnnouncements({}, []);
    const timeline = announcements.timeline;
    announcements.timeline = async (projectId, signal) => {
      log.push(`timeline ${projectId}`);
      return timeline(projectId, signal);
    };
    let calls = 0;

    const result = await runIngestion(
      repository,
      { logger, analysisConcurrency: 1 },
      deps({
        discoverProjects: async (context) => ({
          ...(await deps().discoverProjects(context)),
          records: [],
        }),
        announcements,
        recordDeadlineMs: 20,
        classifyDocument: async (pdf) => {
          calls += 1;
          if (calls === 1) {
            // Far past the deadline, then it answers after all.
            await wait(80);
            log.push('late model call settled');
          }
          return deps().classifyDocument(pdf);
        },
      }),
    );

    // The first record was given up at its deadline, but the second did not
    // start until the model had let go of the first Archive.
    expect(log).toEqual(['timeline a', 'late model call settled', 'timeline b']);
    expect(await repository.get('a')).toMatchObject({ outcome: 'error', attempts: 1 });
    expect((await repository.get('b'))?.outcome).toBe('tor_analysed');
    expect(result.attempted).toBe(2);
  });
});

describe('a site that stops answering, counted across the whole Run', () => {
  const silence = () => new UnreachableError('transport error: timed out');
  const nothing = {
    records: [],
    notEBidding: 0,
    tombstoned: 0,
    truncated: 0,
    drafts: [],
    failures: [],
    rateLimited: false,
    unreachable: false,
    complete: true,
    cursor: {},
    ranAt: '2026-09-09T00:00:00.000Z',
  };

  /**
   * Discovery's feed requests are scripted: each step is a request that gets no
   * answer ('silent') or one that does ('answered'), or a wait for Retrieval's
   * next timeline request to be done (the first also hands it two projects).
   * Retrieval's timelines answer as `timelines` says.
   */
  async function scripted(
    steps: Array<'silent' | 'answered' | 'retrieval'>,
    timelines: Array<'silent' | 'answered'>,
  ) {
    const repository = new InMemoryProcurementStore();
    // Handed to Retrieval by Discovery, at its first 'retrieval' step, so the
    // order of requests is the script's and not a race.
    const found = [
      procurement({ projectId: 'q1', announceDate: '2026-08-02' }),
      procurement({ projectId: 'q2', announceDate: '2026-08-01' }),
    ];
    let handed = false;
    const log: string[] = [];
    const turnsDone: Array<() => void> = [];
    const turnDone = () => new Promise<void>((resolve) => turnsDone.push(resolve));
    let waiting = turnDone();
    const announcements = fakeAnnouncements({}, []);
    let turn = 0;
    announcements.timeline = async (projectId) => {
      const answer = timelines[turn++] ?? 'answered';
      log.push(`timeline ${projectId} ${answer}`);
      // Discovery goes on at once, so its next request is at the gate (a better
      // tier) before the next record's.
      turnsDone.shift()?.();
      if (answer === 'silent') throw silence();
      return [];
    };

    const result = await runIngestion(
      repository,
      { logger },
      deps({
        announcements,
        discoverProjects: async (context) => {
          for (const step of steps) {
            if (step === 'retrieval') {
              if (!handed) {
                handed = true;
                await context.save({ records: found, drafts: [], failures: [], cursor: {} });
              }
              await waiting;
              waiting = turnDone();
              continue;
            }
            try {
              await context.site('new_day', async () => {
                log.push(`feed ${step}`);
                if (step === 'silent') throw silence();
              });
            } catch (error) {
              // A request with no answer is the sweep's own failure; it goes on.
              if (error instanceof UnreachableError) continue;
              log.push(`feed turned away: ${(error as Error).name}`);
              break;
            }
          }
          return { ...nothing, complete: false };
        },
      }),
    );
    return { result, repository, log };
  }

  test('Discovery and Retrieval timeouts interleaved stop the Run as unreachable', async () => {
    const { result, repository, log } = await scripted(
      ['silent', 'retrieval', 'silent', 'answered'],
      ['silent'],
    );

    expect(log).toEqual([
      'feed silent',
      'timeline q1 silent',
      'feed silent',
      // The third silence in a row closed the gate: nothing more reached the site.
      'feed turned away: SiteClosedError',
    ]);
    expect(result.discoveryStopped).toBe('unreachable');
    expect(result.aborted).toBe(false);
    // q1's timeout came before the site was known to be down: an ordinary
    // transport failure. q2 was never started.
    expect(await repository.get('q1')).toMatchObject({ outcome: 'error', attempts: 1 });
    expect(await repository.get('q2')).toMatchObject({ state: 'Queued', attempts: 0 });
  });

  test('the record whose timeout shows the site is down goes back to the queue without spending an attempt', async () => {
    const { result, repository, log } = await scripted(
      ['silent', 'silent', 'retrieval', 'answered'],
      ['silent'],
    );

    expect(log).toEqual([
      'feed silent',
      'feed silent',
      'timeline q1 silent',
      'feed turned away: SiteClosedError',
    ]);
    expect(result.discoveryStopped).toBe('unreachable');
    expect(await repository.get('q1')).toMatchObject({ outcome: 'queued', attempts: 0 });
    expect(await repository.get('q2')).toMatchObject({ outcome: 'queued', attempts: 0 });
    expect(result.failures.map((failure) => failure.projectId)).toEqual(['q1']);
  });

  test('a request answered in between starts the count again', async () => {
    const { result, log } = await scripted(
      ['silent', 'retrieval', 'silent', 'silent'],
      ['answered', 'answered'],
    );

    expect(log.filter((line) => line.startsWith('feed'))).toEqual([
      'feed silent',
      'feed silent',
      'feed silent',
    ]);
    expect(log).toContain('timeline q1 answered');
    expect(result.discoveryStopped).toBeNull();
  });
});

describe('a full room, a hanging site, and a deadline that fires mid-write', () => {
  const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
  const nothing = async (context: SweepContext) => ({
    ...(await deps().discoverProjects(context)),
    records: [],
  });
  const logged = (log: string[], timelines: Record<string, AnnouncementRow[] | null> = {}) => {
    const announcements = fakeAnnouncements(timelines, []);
    const timeline = announcements.timeline;
    announcements.timeline = async (projectId, signal) => {
      log.push(`timeline ${projectId}`);
      return timeline(projectId, signal);
    };
    return announcements;
  };

  test('a full room holds back fresh work, not the refreshes queued behind it', async () => {
    const repository = new InMemoryProcurementStore();
    await repository.upsert(procurement({ projectId: 'f1', announceDate: '2026-08-02' }));
    await repository.upsert(procurement({ projectId: 'f2', announceDate: '2026-08-01' }));
    await repository.upsert(
      procurement({
        projectId: 'r',
        state: 'Completed',
        outcome: 'tor_analysed',
        timeline: {
          ...EMPTY_TIMELINE,
          status: 'open',
          stages: { ...EMPTY_STAGES, invited: '2026-09-20T00:00:00.000Z' },
          lastReadAt: '2026-10-01T00:00:00.000Z',
        },
      }),
    );
    const log: string[] = [];
    const [first, second] = (
      await repository.find({ state: 'Queued', limit: 10, offset: 0 })
    ).items.map((record) => record.projectId) as [string, string];

    await runIngestion(
      repository,
      { logger, analysisConcurrency: 1 },
      deps({
        discoverProjects: nothing,
        // An unchanged timeline: the refresh needs no download, so no place.
        announcements: logged(log, {
          r: [{ announceType: 'D0', announceDate: '2026-09-20T02:00:00.000Z' }],
        }),
        classifyDocument: async (pdf) => {
          await wait(30);
          log.push('model end');
          return deps().classifyDocument(pdf);
        },
      }),
    );

    expect(log).toEqual([
      `timeline ${first}`,
      // The first Archive fills the room; the refresh has its turn meanwhile.
      'timeline r',
      'model end',
      `timeline ${second}`,
      'model end',
    ]);
  });

  test('requests the record deadline cancelled count as unanswered: three stop the Run as unreachable', async () => {
    const repository = new InMemoryProcurementStore();
    for (const [index, projectId] of ['h1', 'h2', 'h3', 'h4'].entries()) {
      await repository.upsert(procurement({ projectId, announceDate: `2026-08-0${9 - index}` }));
    }
    const asked: string[] = [];
    const announcements = fakeAnnouncements({}, []);
    // A site that hangs: nothing comes back until the deadline cancels the request.
    announcements.timeline = (projectId, signal) =>
      new Promise((_resolve, reject) => {
        asked.push(projectId);
        signal?.addEventListener('abort', () =>
          reject(new UpstreamError('Request cancelled: https://process5.gprocurement.go.th/…')),
        );
      });

    const result = await runIngestion(
      repository,
      { logger },
      deps({ discoverProjects: nothing, announcements, recordDeadlineMs: 20 }),
    );

    expect(asked).toEqual(['h1', 'h2', 'h3']);
    expect(result.discoveryStopped).toBe('unreachable');
    for (const id of ['h1', 'h2']) {
      expect(await repository.get(id)).toMatchObject({ outcome: 'error', attempts: 1 });
    }
    // The third showed the site is down: not the record's fault.
    expect(await repository.get('h3')).toMatchObject({ outcome: 'queued', attempts: 0 });
    expect(await repository.get('h4')).toMatchObject({ outcome: 'queued', attempts: 0 });
  });

  test('a deadline that fires between two writes of an outcome leaves only the failure stored and counted', async () => {
    class SlowNotes extends InMemoryProcurementStore {
      override async recordFailures(
        failures: Parameters<InMemoryProcurementStore['recordFailures']>[0],
      ) {
        // The note before the outcome is slow to store: the deadline fires meanwhile.
        if (failures.some((failure) => failure.error.includes('no candidate could be read'))) {
          await wait(50);
        }
        return super.recordFailures(failures);
      }
    }
    const repository = new SlowNotes();
    await repository.upsert(procurement());

    const result = await runIngestion(
      repository,
      { logger },
      deps({
        discoverProjects: nothing,
        recordDeadlineMs: 20,
        classifyDocument: async () => ({
          isTor: false,
          torKind: null,
          whatThisIs: '',
          analysis: null,
          judgement: null,
          unreadable: '429 Resource exhausted',
        }),
      }),
    );
    await wait(60);

    expect(await repository.get('66059313551')).toMatchObject({ outcome: 'error', attempts: 1 });
    expect(result).toMatchObject({ failed: 1, torAnalysed: 0, held: 0, dropped: 0 });
  });
});

describe('a site that sends a web page in place of data', () => {
  test('stops the Run at the first: one failure, no attempt spent, nothing more asked', async () => {
    const repository = new InMemoryProcurementStore();
    const log: string[] = [];
    const announcements = fakeAnnouncements({}, []);
    announcements.timeline = async (projectId) => {
      log.push(`timeline ${projectId}`);
      throw new SiteUnavailableError('แจ้งปิดระบบ e-GP ชั่วคราว');
    };

    const result = await runIngestion(
      repository,
      { logger },
      deps({
        announcements,
        discoverProjects: async (context) => {
          await context.save({
            records: [
              procurement({ projectId: 'q1', announceDate: '2026-08-02' }),
              procurement({ projectId: 'q2', announceDate: '2026-08-01' }),
            ],
            drafts: [],
            failures: [],
            cursor: {},
          });
          for (let day = 0; day < 3; day++) {
            try {
              await context.site('history', async () => log.push(`feed ${day}`));
            } catch (error) {
              log.push(`feed turned away: ${(error as Error).name}`);
              break;
            }
          }
          return {
            records: [],
            notEBidding: 0,
            tombstoned: 0,
            truncated: 0,
            drafts: [],
            failures: [],
            rateLimited: false,
            unreachable: true,
            complete: false,
            cursor: {},
            ranAt: '2026-09-09T00:00:00.000Z',
          };
        },
      }),
    );

    expect(log).toEqual(['feed 0', 'timeline q1', 'feed turned away: SiteClosedError']);
    expect(result.discoveryStopped).toBe('unavailable');
    expect(result.aborted).toBe(false);
    expect(result.failures.map((failure) => failure.projectId)).toEqual(['q1']);
    expect(result.failures[0]?.error).toContain('แจ้งปิดระบบ e-GP ชั่วคราว');
    expect(await repository.get('q1')).toMatchObject({ outcome: 'queued', attempts: 0 });
    expect(await repository.get('q2')).toMatchObject({ outcome: 'queued', attempts: 0 });
  });
});
