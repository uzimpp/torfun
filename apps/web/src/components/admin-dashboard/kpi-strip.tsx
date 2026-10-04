import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { KpiTile } from './view-models';

/**
 * The numbers an administrator reads first, as one ruled strip rather than
 * separate cards. Each tile opens the records it counts.
 *
 * A tile turns red only when there is something to act on, and then says so in
 * words too, so the warning survives without colour.
 */
export function KpiStrip({ tiles }: { tiles: KpiTile[] }) {
  return (
    <ul
      aria-label="ตัวเลขหลัก"
      className="bg-border grid grid-cols-2 gap-px overflow-hidden rounded-xl border sm:grid-cols-3"
    >
      {tiles.map((tile) => (
        <li key={tile.key} className="bg-card flex">
          <Link
            href={tile.href}
            className="hover:bg-muted/60 active:bg-muted focus-visible:ring-ring/50 flex w-full flex-col gap-1 p-4 outline-none focus-visible:ring-[3px] focus-visible:ring-inset motion-safe:transition-colors"
          >
            <span className="text-muted-foreground flex items-center gap-1.5 text-xs">
              {tile.label}
              {tile.alert ? (
                <>
                  <AlertTriangle className="text-destructive size-3.5" aria-hidden="true" />
                  <span className="sr-only">ต้องตรวจสอบ</span>
                </>
              ) : null}
            </span>
            <span
              className={cn(
                'text-xl font-semibold break-words tabular-nums',
                tile.key !== 'lastRun' && 'font-mono',
                tile.alert && 'text-destructive',
              )}
            >
              {tile.value}
            </span>
            <span className="text-muted-foreground text-xs">{tile.hint}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
