import { expect, test } from 'bun:test';
import { fakeAnnouncements } from '../../testing/announcement-client';
import { zipSync } from 'fflate';
import { EMPTY_MILESTONES, type Procurement } from '@torfun/types';
import { InMemoryProcurementStore } from '../../testing/procurement-store';
import { runIngestion, type IngestionDeps } from './pipeline';
import { extractTorPdfs } from './tor-package';

/**
 * A run reads archive after archive in one process, so memory that an archive
 * leaves behind adds up across a run even when one record looks harmless. This
 * drives real archives through the real extractor and asserts the process ends
 * where it began: a per-record leak of even a fraction of an archive fails it.
 */

const ARCHIVES = 50;
const WARM_UP = 10;
const MB = 1024 * 1024;

const logger = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
} as unknown as Parameters<typeof runIngestion>[1]['logger'];

/** Random bytes do not compress, so each archive really is this big in memory. */
const random = (size: number) => crypto.getRandomValues(new Uint8Array(size));

function syntheticArchive(): Uint8Array {
  return zipSync({
    'Attach_TOR_1.pdf': random(1 * MB),
    'Bidding Document.pdf': random(2 * MB),
    'contract_01.pdf': random(2 * MB),
  });
}

function record(index: number): Procurement {
  const projectId = String(66000000000 + index);
  return {
    projectId,
    projectName: 'จ้างพัฒนาระบบสารสนเทศ',
    deptName: 'กรุงเทพมหานคร',
    deptSubName: null,
    province: null,
    district: null,
    subdistrict: null,
    deptCode: '0100',
    budgetYear: 2568,
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
    winner: null,
    torAmbiguous: false,
    discoveredAt: '2026-09-09T00:00:00.000Z',
    sourceHash: null,
    updatedAt: '2026-09-09T00:00:00.000Z',
  };
}

function memory() {
  Bun.gc(true);
  Bun.gc(true);
  return { arrayBuffers: process.memoryUsage().arrayBuffers };
}

test(`${ARCHIVES} archives leave buffers where they started`, async () => {
  const records = Array.from({ length: ARCHIVES }, (_, index) => record(index));
  let read = 0;
  const classified: number[] = [];

  const deps: IngestionDeps = {
    discoverProjects: async () => ({
      records,
      rejected: [],
      notEBidding: 0,
      tombstoned: 0,
      resolutions: [],
      failures: [],
      rateLimited: false,
      budgetReached: false,
      quota: null,
      ranAt: '2026-09-09T00:00:00.000Z',
    }),
    resolveZipId: async () => 'zip',
    downloadArchive: async () => {
      read += 1;
      return syntheticArchive();
    },
    extractTorPdfs,
    classifyDocument: async (pdf) => {
      classified.push(pdf.byteLength);
      return { isTor: false, torKind: null, whatThisIs: 'x', analysis: null, judgement: null };
    },
    readInvitation: async () => ({ documents: [], bidAt: null }),
    announcements: fakeAnnouncements({}, []),
    sleep: async () => {},
    recordDeadlineMs: 60_000,
  };

  const drive = () => runIngestion(new InMemoryProcurementStore(), { apiKey: 'k', logger }, deps);

  // The first records pay for one-off costs (compiled code, pooled allocators)
  // that are not growth. Measure from after them.
  await drive();
  read = 0;
  classified.length = 0;

  const before = memory();
  await drive();
  const after = memory();

  expect(read).toBe(ARCHIVES);
  expect(classified).toHaveLength(ARCHIVES);
  // 50 archives are 250 MB; retaining even one in five would breach this.
  expect(after.arrayBuffers - before.arrayBuffers).toBeLessThan(20 * MB);
  // Only buffers are asserted. JS heap size swings by tens of megabytes with GC
  // timing whatever the code does, so any bound on it is a guess, not a check.
}, 120_000);
