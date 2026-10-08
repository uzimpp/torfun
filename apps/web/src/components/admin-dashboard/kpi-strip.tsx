import { AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { KpiTile } from './view-models';

/**
 * The six numbers an administrator reads first, as one ruled strip rather than
 * six separate cards: they belong together, and a hairline between them costs
 * less attention than six raised boxes.
 *
 * A tile turns red only when there is something to act on, and then says so in
 * words too, so the warning survives without colour.
 */
export function KpiStrip({ tiles }: { tiles: KpiTile[] }) {
  return (
    <dl className="bg-border grid grid-cols-2 gap-px overflow-hidden rounded-xl border sm:grid-cols-3 lg:grid-cols-6">
      {tiles.map((tile) => (
        <div key={tile.key} className="bg-card flex flex-col gap-1 p-4">
          <dt className="text-muted-foreground flex items-center gap-1.5 text-xs">
            {tile.label}
            {tile.alert ? (
              <>
                <AlertTriangle className="text-destructive size-3.5" aria-hidden="true" />
                <span className="sr-only">ต้องตรวจสอบ</span>
              </>
            ) : null}
          </dt>
          <dd
            className={cn(
              'text-xl font-semibold break-words tabular-nums sm:text-2xl',
              tile.alert && 'text-destructive',
            )}
          >
            {tile.value}
          </dd>
          <dd className="text-muted-foreground text-xs">{tile.hint}</dd>
        </div>
      ))}
    </dl>
  );
}
