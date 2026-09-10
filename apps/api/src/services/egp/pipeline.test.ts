import { describe, expect, mock, test } from 'bun:test';
import type { Procurement } from '@torfun/types';
import { InMemoryProcurementStore } from '../../testing/procurement-store';
import { RateLimitedError } from './client';
import { runIngestion, type IngestionDeps } from './pipeline';
import type { ExtractedPdf } from './tor-package';

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
    registryName: 'กรุงเทพมหานคร',
    deptCode: '0100',
    year: 2568,
    announceDate: '2026-08-01',
    projectTypeName: 'จ้างทำของ',
    purchaseMethodName: 'ประกวดราคาอิเล็กทรอนิกส์ (e-bidding)',
    projectMoney: 5_000_000,
    priceBuild: null,
    status: 'invitation',
    matchedKeywords: ['จ้างพัฒนา'],
    softwareClass: 'new_build',
    softwareScore: 5,
    eBidding: true,
    state: 'Queued',
    outcome: 'queued',
    statusHistory: [],
    zipId: null,
    zipBytes: null,
    archiveMemberCount: null,
    documents: [],
    analysis: null,
    winner: null,
    torAmbiguous: false,
    discoveredAt: '2026-09-09T00:00:00.000Z',
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
  isSoftwareProject: true,
  confidence: 'high' as const,
};

/** Every stage stubbed to the happy path; each test overrides what it is about. */
function deps(overrides: Partial<IngestionDeps> = {}): IngestionDeps {
  return {
    discoverProjects: async () => ({
      records: [procurement()],
      rejected: [],
      resolutions: [],
      failures: [],
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
    }),
    sleep: async () => {},
    ...overrides,
  };
}

const run = (repository: InMemoryProcurementStore, overrides: Partial<IngestionDeps> = {}) =>
  runIngestion(
    repository,
    { apiKey: 'k', maxDownloads: 5, eBiddingOnly: true, logger },
    deps(overrides),
  );

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
    expect(result.torAnalysed).toBe(1);
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

  test('a rate limit aborts the run and leaves the rest Queued', async () => {
    const repository = new InMemoryProcurementStore();
    const second = procurement({ projectId: '66059313552' });
    const result = await run(repository, {
      discoverProjects: async () => ({
        records: [procurement(), second],
        rejected: [],
        resolutions: [],
        failures: [],
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
        rejected: [],
        resolutions: [],
        failures: [],
        ranAt: '2026-09-09T00:00:00.000Z',
      }),
      resolveZipId: failing,
    });

    expect(result.aborted).toBe(false);
    expect((await repository.get('66059313551'))?.outcome).toBe('error');
    expect((await repository.get('66059313552'))?.outcome).toBe('tor_analysed');
    expect(
      repository
        .listFailures()
        .some((f: { error: string }) => f.error.includes('connection reset')),
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
      repository
        .listFailures()
        .some((f: { error: string }) => f.error.includes('../../etc/Attach_TOR_evil.pdf')),
    ).toBe(true);
  });

  test('a document is classified once per candidate, and only candidates', async () => {
    const repository = new InMemoryProcurementStore();
    const classify = mock(async () => ({
      isTor: true,
      torKind: 'final' as const,
      whatThisIs: 'ขอบเขตของงาน',
      analysis,
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
