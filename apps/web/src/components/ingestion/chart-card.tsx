import type { ReactNode } from 'react';
import { DISCLOSURE, StatValue, TABLE_HEAD } from '@/components/admin/admin-ui';
import { cn } from '@/lib/utils';

export interface TableColumn<T> {
  header: string;
  cell: (row: T) => ReactNode;
}

/**
 * One chart on a card: title and a one-line subtitle, an optional headline
 * figure, the plot, and the same numbers as a table one click away. With
 * `empty` set the plot's frame stays and the message says why it has no marks.
 */
export function ChartCard<T>({
  id,
  title,
  subtitle,
  headline,
  empty,
  rows,
  rowKey,
  columns,
  className,
  children,
}: {
  id: string;
  title: string;
  subtitle: string;
  headline?: { value: string; caption: string } | null;
  empty: string | null;
  /** The table's rows, in the order they should read (newest first). */
  rows: T[];
  rowKey: (row: T) => string;
  columns: TableColumn<T>[];
  className?: string;
  children: ReactNode;
}) {
  return (
    <figure
      aria-labelledby={`${id}-title`}
      aria-describedby={`${id}-subtitle`}
      className={cn('bg-card flex min-w-0 flex-col gap-4 rounded-xl border p-5', className)}
    >
      <figcaption className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-0.5">
          <span id={`${id}-title`} className="text-base font-medium">
            {title}
          </span>
          <span id={`${id}-subtitle`} className="text-muted-foreground text-sm">
            {subtitle}
          </span>
        </div>
        {headline ? (
          <div className="flex shrink-0 flex-col items-end">
            <StatValue>{headline.value}</StatValue>
            <span className="text-muted-foreground text-xs">{headline.caption}</span>
          </div>
        ) : null}
      </figcaption>

      <div className="relative">
        <div aria-hidden={empty ? true : undefined}>{children}</div>
        {empty ? (
          <p className="text-muted-foreground absolute inset-0 flex items-center justify-center px-6 text-center text-sm">
            <span className="bg-card/90 rounded-md px-2 py-1">{empty}</span>
          </p>
        ) : null}
      </div>

      {!empty && rows.length > 0 ? (
        <details>
          <summary className={DISCLOSURE}>ดูเป็นตาราง</summary>
          <div className="mt-2 max-h-64 overflow-y-auto">
            <table className="w-full text-sm tabular-nums">
              <thead>
                <tr className="border-b text-left">
                  {columns.map((column, index) => (
                    <th
                      key={column.header}
                      className={cn(TABLE_HEAD, 'py-1.5', index > 0 && 'text-right')}
                    >
                      {column.header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((row) => (
                  <tr key={rowKey(row)}>
                    {columns.map((column, index) => (
                      <td key={column.header} className={cn('py-1.5', index > 0 && 'text-right')}>
                        {column.cell(row)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      ) : null}
    </figure>
  );
}
