import type { IngestionRun, RunTrigger } from '@torfun/types';
import { formatShortDateTime } from '@/lib/format-date';
import { formatCount } from '@/lib/format-number';
import { formatDuration } from './ops-view';

export const TRIGGER_LABELS: Record<RunTrigger, string> = {
  manual: 'ด้วยมือ',
  scheduled: 'ตามตาราง',
};

export const RUN_HISTORY_EMPTY = 'ยังไม่มีรอบที่บันทึก — เริ่มบันทึกตั้งแต่รอบถัดไป';

export type RunResultTone = 'ok' | 'neutral' | 'warn' | 'error';

/** How a run ended. A refusal from the site outranks an admin's stop: it is the one to act on. */
export function runResult(run: IngestionRun): { label: string; tone: RunResultTone } {
  if (run.error !== null || run.counts === null) return { label: 'ผิดพลาด', tone: 'error' };
  if (run.counts.aborted) return { label: 'เว็บปฏิเสธ', tone: 'warn' };
  if (run.counts.stopped === 'admin') return { label: 'หยุดโดยผู้ดูแล', tone: 'neutral' };
  return { label: 'สำเร็จ', tone: 'ok' };
}

const count = (value: number | undefined) => (value === undefined ? '—' : formatCount(value));

export function runHistoryRows(runs: IngestionRun[]) {
  return runs.map((run) => ({
    id: run.id,
    started: formatShortDateTime(run.startedAt),
    trigger: TRIGGER_LABELS[run.trigger],
    duration: formatDuration(run.durationMs),
    attempted: count(run.counts?.attempted),
    analysed: count(run.counts?.torAnalysed),
    held: count(run.counts?.held),
    failed: count(run.counts?.failed),
    tokens: formatCount(run.tokens.total),
    tokenDetail: `prompt ${formatCount(run.tokens.prompt)} · output ${formatCount(run.tokens.output)} · thinking ${formatCount(run.tokens.thoughts)} — นับโดย Gemini; ไม่รวมการเรียกที่ล้มเหลว`,
    result: runResult(run),
  }));
}

export type RunHistoryRow = ReturnType<typeof runHistoryRows>[number];
