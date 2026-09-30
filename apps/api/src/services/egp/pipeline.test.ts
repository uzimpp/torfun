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
    province: 'กรุงเทพมหานคร',
    district: 'คลองเตย',
    subdistrict: 'คลองเตย',
    registryName: 'กรุงเทพมหานคร',
    deptCode: '0100',
    year: 2568,
    announceDate: '2026-08-01',
    projectTypeName: 'จ้างทำของ',
    purchaseMethodName: 'ประกวดราคาอิเล็กทรอนิกส์ (e-bidding)',
    projectMoney: 5_000_000,
    priceBuild: null,
    status: 'open',
    statusSource: 'upstream',
    upstreamStatus: 'หนังสือเชิญชวน/ประกาศเชิญชวน',
    matchedKeywords: ['จ้างพัฒนา'],
    softwareClass: 'new_build',
    softwareScore: 5,
    eBidding: true,
    state: 'Queued',
    outcome: 'queued',
    attempts: 0,
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
    recordDeadlineMs: 60_000,
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
        rejected: [],
        resolutions: [],
        failures: [],
        ranAt: '2026-09-09T00:00:00.000Z',
      }),
      classifyDocument: async () => {
        await hung;
        return { isTor: true, torKind: 'final' as const, whatThisIs: 'ขอบเขตของงาน', analysis };
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

describe('a deadline that fires while a site request is in flight', () => {
  const two = () => ({
    discoverProjects: async () => ({
      records: [procurement(), procurement({ projectId: '66059313552' })],
      rejected: [],
      resolutions: [],
      failures: [],
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

describe('what Gemini reads from the TOR', () => {
  const reading = (
    overrides: {
      procurementStatus?: 'drafting' | 'awarded' | null;
      isSoftwareProject?: boolean;
    } = {},
  ): Partial<IngestionDeps> => ({
    classifyDocument: async () => ({
      isTor: true,
      torKind: 'final' as const,
      whatThisIs: 'ขอบเขตของงาน',
      analysis: { ...analysis, isSoftwareProject: overrides.isSoftwareProject ?? true },
      procurementStatus: overrides.procurementStatus ?? null,
    }),
  });
  const unread = (overrides: Partial<Procurement> = {}) => ({
    discoverProjects: async () => ({
      records: [
        procurement({
          status: 'unknown',
          statusSource: null,
          upstreamStatus: 'ระหว่างดำเนินการ',
          ...overrides,
        }),
      ],
      rejected: [],
      resolutions: [],
      failures: [],
      ranAt: '2026-09-09T00:00:00.000Z',
    }),
  });

  test('a TOR the model judges not to be software work ends as not_software, analysis kept', async () => {
    const repository = new InMemoryProcurementStore();
    await run(repository, reading({ isSoftwareProject: false }));

    const record = await repository.get('66059313551');
    expect(record?.state).toBe('Completed');
    expect(record?.outcome).toBe('not_software');
    // The record stays readable and overrulable: nothing is discarded.
    expect(record?.analysis?.isSoftwareProject).toBe(false);
    expect(record?.documents.find((d) => d.role === 'main_tor')).toBeDefined();
  });

  test('fills in a stage nobody has read yet, and marks it as the model’s reading', async () => {
    const repository = new InMemoryProcurementStore();
    await run(repository, { ...unread(), ...reading({ procurementStatus: 'drafting' }) });

    const record = await repository.get('66059313551');
    expect(record?.status).toBe('drafting');
    expect(record?.statusSource).toBe('ai');
  });

  test('never overrides a stage the feed named', async () => {
    const repository = new InMemoryProcurementStore();
    // The default record is `open`, read from upstream.
    await run(repository, reading({ procurementStatus: 'awarded' }));

    const record = await repository.get('66059313551');
    expect(record?.status).toBe('open');
    expect(record?.statusSource).toBe('upstream');
  });

  test('leaves the status unclassified when the documents do not show one', async () => {
    const repository = new InMemoryProcurementStore();
    await run(repository, { ...unread(), ...reading({ procurementStatus: null }) });

    const record = await repository.get('66059313551');
    expect(record?.status).toBe('unknown');
    expect(record?.statusSource).toBeNull();
  });

  test('a model reading survives the next discovery sweep', async () => {
    const repository = new InMemoryProcurementStore();
    await run(repository, { ...unread(), ...reading({ procurementStatus: 'drafting' }) });

    // The feed still says only "in progress", which places the project nowhere.
    await run(repository, { ...unread(), resolveZipId: async () => null });

    expect((await repository.get('66059313551'))?.status).toBe('drafting');
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
        return { isTor: false, torKind: null, whatThisIs: 'ไม่ใช่ TOR', analysis: null };
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
        rejected: [],
        resolutions: [],
        failures: [],
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
        rejected: [],
        resolutions: [],
        failures: [],
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
        rejected: [],
        resolutions: [],
        failures: [],
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
