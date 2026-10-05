import type { IngestionOps } from '@torfun/types';
import { RecordTimingStat } from './record-timing-stat';
import { DiscoveredChart, StageFailuresChart, ThroughputChart } from './trend-charts';

/** The ingestion page's trends: what was found, how it ended, where it failed, how long it took. */
export function OpsCharts({ ops }: { ops: IngestionOps }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <DiscoveredChart days={ops.discoveredDaily} />
        <ThroughputChart days={ops.throughputDaily} />
      </div>
      <div className="grid items-start gap-4 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <StageFailuresChart failures={ops.failuresByStage} />
        <RecordTimingStat timings={ops.recordTimings} />
      </div>
    </div>
  );
}
