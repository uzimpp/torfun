import type { IngestionOps } from '@torfun/types';
import { DiscoveredChart, ThroughputChart } from './trend-charts';

/** The ingestion page's two daily trends, side by side: what was found, and how it ended. */
export function OpsCharts({
  ops,
}: {
  ops: Pick<IngestionOps, 'discoveredDaily' | 'throughputDaily'>;
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <DiscoveredChart days={ops.discoveredDaily} />
      <ThroughputChart days={ops.throughputDaily} />
    </div>
  );
}
