import type { FastifyBaseLogger } from 'fastify';
import type { IngestionDeps } from '../services/egp/pipeline';

/** A logger that says nothing, for tests that drive a real service. */
export const silentLogger = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
} as unknown as FastifyBaseLogger;

/**
 * Pipeline stages for a Run whose discovery waits on a gate, so a test decides
 * when the Run finishes — and can look at the world while it is still going.
 * With `fail`, discovery throws once the gate opens.
 */
export function gatedDeps(fail = false) {
  /** How many times a Run actually swept upstream, for tests about skipping a sweep. */
  const calls = { discover: 0 };
  let open: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    open = resolve;
  });
  const deps: IngestionDeps = {
    discoverProjects: async () => {
      calls.discover += 1;
      await gate;
      if (fail) throw new Error('upstream exploded');
      return {
        records: [],
        rejected: [],
        resolutions: [],
        failures: [],
        rateLimited: false,
        budgetReached: false,
        quota: null,
        ranAt: new Date().toISOString(),
      };
    },
    resolveZipId: async () => null,
    downloadArchive: async () => new Uint8Array(),
    extractTorPdfs: () => ({ torFiles: [], members: [], unsafeSkipped: [] }),
    classifyDocument: async () => ({ isTor: false, torKind: null, whatThisIs: '', analysis: null }),
    sleep: async () => {},
    recordDeadlineMs: 60_000,
  };
  return { deps, open, calls };
}
