import { IngestionStage, type IngestionFailure, type IngestionRun } from '@torfun/types';
import { formatElapsed } from './status-tracking';

/**
 * What the operations page says about runs, timings and failures, as plain
 * functions so the wording and the grouping can be tested without a DOM.
 */

/** In pipeline order, so a run's failures read in the order the work happens. */
export const STAGE_ORDER = IngestionStage.options;

export const STAGE_LABELS: Record<IngestionStage, string> = {
  dept: 'ระบุหน่วยงาน',
  discovery: 'ค้นหาประกาศ',
  timeline: 'อ่านไทม์ไลน์',
  info: 'อ่านข้อมูลประกาศ',
  download: 'ดาวน์โหลดเอกสาร',
  extract: 'แยกไฟล์ TOR',
  analysis: 'วิเคราะห์ด้วย AI',
};

export function formatDuration(ms: number | null): string {
  if (ms === null) return '—';
  if (ms < 10_000) return `${(Math.max(0, ms) / 1000).toFixed(1)} วิ`;
  return formatElapsed(ms);
}

/** Upstream published no TOR: logged as a failure, but there is nothing to fix. */
export function isNoTor(failure: IngestionFailure): boolean {
  return failure.kind === 'no_tor';
}

export interface StageFailureGroup {
  stage: IngestionStage;
  label: string;
  items: IngestionFailure[];
}

export interface FailureGroup {
  key: string;
  /** Null for the live run and for failures no recorded run covers. */
  run: IngestionRun | null;
  live: boolean;
  problems: StageFailureGroup[];
  noTor: IngestionFailure[];
  total: number;
}

/**
 * Failures carry no run id, so each is placed in the run whose start–end window
 * holds its time: the live run first, then recorded runs newest first, then the
 * rest (older than the run log, or from a run that never wrote one).
 */
export function groupFailures(
  failures: IngestionFailure[],
  runs: IngestionRun[],
  liveStartedAt: string | null,
): FailureGroup[] {
  const buckets = new Map<string, { run: IngestionRun | null; items: IngestionFailure[] }>();
  const keys = [...(liveStartedAt ? ['live'] : []), ...runs.map((run) => run.id), 'unassigned'];
  for (const key of keys) {
    buckets.set(key, { run: runs.find((run) => run.id === key) ?? null, items: [] });
  }

  const liveFrom = liveStartedAt ? Date.parse(liveStartedAt) : null;
  for (const failure of failures) {
    const at = Date.parse(failure.at);
    const key =
      liveFrom !== null && at >= liveFrom
        ? 'live'
        : (runs.find((run) => at >= Date.parse(run.startedAt) && at <= Date.parse(run.endedAt))
            ?.id ?? 'unassigned');
    buckets.get(key)!.items.push(failure);
  }

  return keys.flatMap((key) => {
    const { run, items } = buckets.get(key)!;
    if (items.length === 0) return [];
    const problems = STAGE_ORDER.flatMap((stage) => {
      const inStage = items.filter((item) => item.stage === stage && !isNoTor(item));
      return inStage.length > 0 ? [{ stage, label: STAGE_LABELS[stage], items: inStage }] : [];
    });
    return [
      {
        key,
        run,
        live: key === 'live',
        problems,
        noTor: items.filter(isNoTor),
        total: items.length,
      },
    ];
  });
}
