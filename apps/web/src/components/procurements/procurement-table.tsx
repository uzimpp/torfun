'use client';

import { OUTCOME_LABELS, STATUS_LABELS, type Procurement } from '@torfun/types';
import { LoadingRegion } from '@/components/admin/loading-region';
import { StatusBadge } from '@/components/admin/status-badge';
import { ProjectActionMenu } from '@/components/ingestion/project-action-menu';
import type { ProjectAction } from '@/components/ingestion/project-action-dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { BUCKET_LABELS, bucketOfOutcome } from '@/lib/outcome-buckets';
import { cn } from '@/lib/utils';
import { countTorDocuments, formatThb } from './procurement-format';

const HEAD =
  'bg-card text-muted-foreground sticky top-(--header-h) z-10 h-10 border-b px-3 text-left align-middle text-xs font-medium';

/** Below `md` each row is a stacked card-like block; from `md` it is a table row. */
const ROW =
  'grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 gap-y-1.5 border-b px-4 py-3 last:border-b-0 md:table-row md:h-12 md:p-0';

/** Badge and outcome only; time in stage and tries used are in the drawer. */
function StatusCell({ record }: { record: Procurement }) {
  const bucket = bucketOfOutcome(record.outcome);
  const outcome = OUTCOME_LABELS[record.outcome];
  return (
    <div className="flex min-w-0 flex-col items-start gap-0.5">
      <StatusBadge bucket={bucket} />
      {outcome !== BUCKET_LABELS[bucket] ? (
        <span className="text-muted-foreground text-xs break-words">{outcome}</span>
      ) : null}
    </div>
  );
}

function SkeletonRows() {
  return Array.from({ length: 8 }, (_, row) => (
    <tr key={row} aria-hidden="true" className={ROW}>
      <td className="md:px-3 md:py-2">
        <Skeleton className="h-5 w-20 rounded-full" />
      </td>
      <td className="col-span-2 md:px-3 md:py-2">
        <Skeleton className="h-4 w-full max-w-md" />
        <Skeleton className="mt-2 h-3 w-40" />
      </td>
      <td className="hidden md:table-cell md:px-3">
        <Skeleton className="h-4 w-3/4" />
      </td>
      <td className="hidden md:table-cell md:px-3">
        <Skeleton className="ml-auto h-4 w-20" />
      </td>
      <td className="hidden lg:table-cell lg:px-3">
        <Skeleton className="ml-auto h-4 w-10" />
      </td>
      <td className="hidden md:table-cell" />
    </tr>
  ));
}

/**
 * The admin procurement list on one surface. The whole row opens the record;
 * the project name is the row's keyboard target, and the action menu is kept
 * out of the row's click.
 */
export function ProcurementTable({
  items,
  loading,
  selectedId,
  onOpen,
  onAction,
}: {
  items: Procurement[];
  /** First load only: skeleton rows the size of real ones. */
  loading: boolean;
  selectedId: string;
  onOpen: (projectId: string) => void;
  onAction: (record: Procurement, action: ProjectAction) => void;
}) {
  return (
    <>
      {loading ? <LoadingRegion className="sr-only" /> : null}
      <table aria-busy={loading} className="block w-full text-sm md:table md:table-fixed">
        <caption className="sr-only">ประกาศที่ดึงเข้าระบบ</caption>
        <thead className="hidden md:table-header-group">
          <tr>
            <th scope="col" className={cn(HEAD, 'w-36 rounded-tl-lg lg:w-40')}>
              สถานะ
            </th>
            <th scope="col" className={HEAD}>
              โครงการ
            </th>
            <th scope="col" className={cn(HEAD, 'w-[24%]')}>
              หน่วยงาน
            </th>
            <th scope="col" className={cn(HEAD, 'w-32 text-right')}>
              งบประมาณ (บาท)
            </th>
            <th scope="col" className={cn(HEAD, 'hidden w-16 text-right lg:table-cell')}>
              ปีงบ
            </th>
            <th scope="col" className={cn(HEAD, 'w-12 rounded-tr-lg')}>
              <span className="sr-only">การดำเนินการ</span>
            </th>
          </tr>
        </thead>
        <tbody className="block md:table-row-group">
          {loading ? (
            <SkeletonRows />
          ) : (
            items.map((record) => {
              const tors = countTorDocuments(record);
              const selected = record.projectId === selectedId;
              return (
                <tr
                  key={record.projectId}
                  data-selected={selected || undefined}
                  onClick={() => onOpen(record.projectId)}
                  className={cn(
                    ROW,
                    'hover:bg-muted/50 active:bg-muted cursor-pointer transition-colors motion-reduce:transition-none',
                    selected && 'bg-primary/5 hover:bg-primary/5',
                  )}
                >
                  <td className="min-w-0 md:px-3 md:py-2 md:align-top">
                    <StatusCell record={record} />
                  </td>
                  <td className="col-span-2 min-w-0 md:px-3 md:py-2 md:align-top">
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        onOpen(record.projectId);
                      }}
                      className="focus-visible:ring-ring/50 line-clamp-2 rounded-sm text-left font-medium break-words outline-none hover:underline focus-visible:ring-[3px]"
                    >
                      {record.projectName}
                    </button>
                    <p className="text-muted-foreground mt-1 flex flex-wrap gap-x-2 gap-y-0.5 text-xs">
                      <span className="font-mono tabular-nums">{record.projectId}</span>
                      <span aria-hidden="true">·</span>
                      <span>
                        TOR <span className="font-mono tabular-nums">{tors}</span> ไฟล์
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>{STATUS_LABELS[record.status]}</span>
                      <span className="lg:hidden">
                        · ปีงบ <span className="font-mono tabular-nums">{record.budgetYear}</span>
                      </span>
                      <span className="md:hidden">
                        ·{' '}
                        <span className="font-mono tabular-nums">
                          {formatThb(record.projectMoney)}
                        </span>{' '}
                        บาท
                      </span>
                    </p>
                    <p className="text-muted-foreground mt-0.5 text-xs break-words md:hidden">
                      {record.deptName}
                    </p>
                  </td>
                  <td className="hidden min-w-0 text-sm break-words md:table-cell md:px-3 md:py-2 md:align-top">
                    {record.deptName}
                  </td>
                  <td className="hidden text-right font-mono tabular-nums md:table-cell md:px-3 md:py-2 md:align-top">
                    {formatThb(record.projectMoney)}
                  </td>
                  <td className="hidden text-right font-mono tabular-nums lg:table-cell lg:px-3 lg:py-2 lg:align-top">
                    {record.budgetYear}
                  </td>
                  <td
                    className="col-start-2 row-start-1 md:px-1 md:py-1.5 md:align-top"
                    onClick={(event) => event.stopPropagation()}
                  >
                    <ProjectActionMenu
                      record={record}
                      onChoose={(action) => onAction(record, action)}
                    />
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </>
  );
}
