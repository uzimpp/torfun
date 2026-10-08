import { History } from 'lucide-react';
import type { IngestionRun } from '@torfun/types';
import { AdminSection, TABLE_HEAD } from '@/components/admin/admin-ui';
import { STATUS_STYLE } from '@/components/admin/status-badge';
import { cn } from '@/lib/utils';
import { RUN_HISTORY_EMPTY, runHistoryRows, type RunResultTone } from './run-history-view';

const TONE: Record<RunResultTone, string> = {
  ok: STATUS_STYLE.analysed.text,
  neutral: 'text-muted-foreground',
  error: STATUS_STYLE.failed.text,
};

const COLUMNS = [
  { key: 'started', label: 'เริ่ม', numeric: false },
  { key: 'trigger', label: 'วิธีเริ่ม', numeric: false },
  { key: 'duration', label: 'ระยะเวลา', numeric: true },
  { key: 'attempted', label: 'รายการที่ทำ', numeric: true },
  { key: 'analysed', label: 'วิเคราะห์แล้ว', numeric: true },
  { key: 'held', label: 'รอตรวจสอบ', numeric: true },
  { key: 'failed', label: 'ล้มเหลว', numeric: true },
  { key: 'tokens', label: 'โทเคน', numeric: true },
  { key: 'result', label: 'ผล', numeric: false },
] as const;

/**
 * The run log, newest first. Below `md` each row stacks into labelled lines, so
 * the page never scrolls sideways.
 */
export function RunHistory({ runs }: { runs: IngestionRun[] }) {
  const rows = runHistoryRows(runs);

  return (
    <AdminSection id="runs-heading" title="ประวัติรอบ" icon={History}>
      {rows.length === 0 ? (
        <p className="text-muted-foreground text-sm">{RUN_HISTORY_EMPTY}</p>
      ) : (
        <table className="w-full text-sm tabular-nums max-md:block">
          <thead className="max-md:sr-only">
            <tr className="border-b">
              {COLUMNS.map((column) => (
                <th
                  key={column.key}
                  scope="col"
                  className={cn(
                    TABLE_HEAD,
                    'px-2 py-2 first:pl-0 last:pr-0',
                    column.numeric ? 'text-right' : 'text-left',
                  )}
                >
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y max-md:block">
            {rows.map((row) => (
              <tr
                key={row.id}
                className="max-md:grid max-md:grid-cols-2 max-md:gap-x-4 max-md:gap-y-1 max-md:py-3"
              >
                {COLUMNS.map((column) => (
                  <td
                    key={column.key}
                    data-label={column.label}
                    className={cn(
                      'px-2 py-2.5 first:pl-0 last:pr-0',
                      'max-md:flex max-md:justify-between max-md:gap-2 max-md:p-0 max-md:text-xs',
                      'max-md:before:text-muted-foreground max-md:before:content-[attr(data-label)]',
                      column.numeric ? 'text-right' : 'text-left',
                    )}
                  >
                    {column.key === 'result' ? (
                      <span className={TONE[row.result.tone]}>{row.result.label}</span>
                    ) : column.key === 'tokens' ? (
                      <TokenTotal total={row.tokens} detail={row.tokenDetail} id={row.id} />
                    ) : (
                      row[column.key]
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </AdminSection>
  );
}

/** The total, with its split on hover or focus. */
function TokenTotal({ total, detail, id }: { total: string; detail: string; id: string }) {
  const tipId = `run-${id}-tokens`;
  return (
    <span className="group relative inline-block">
      <button
        type="button"
        aria-describedby={tipId}
        className="decoration-muted-foreground/60 cursor-help underline decoration-dotted underline-offset-4"
      >
        {total}
      </button>
      <span
        id={tipId}
        role="tooltip"
        className="bg-popover text-popover-foreground absolute right-0 bottom-full z-10 mb-1 hidden w-64 rounded-md border px-3 py-2 text-left text-xs shadow-md group-focus-within:block group-hover:block"
      >
        {detail}
      </span>
    </span>
  );
}
