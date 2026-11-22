'use client';

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { AdminLoadError } from '@/components/admin/admin-load-error';
import { ADMIN_LINK } from '@/components/admin/admin-ui';
import { LoadingRegion } from '@/components/admin/loading-region';
import { DiscoveredChart } from '@/components/ingestion/trend-charts';
import { useIngestionOps } from '@/components/ingestion/use-ingestion-ops';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

/** What was found over 30 days; the rest of the trends are on the ingestion page. */
export function DashboardTrends({ live }: { live: boolean }) {
  const { ops, loading, error, reload } = useIngestionOps({ live });

  return (
    <section aria-label="แนวโน้ม 30 วัน" className="flex flex-col gap-2">
      {error ? (
        <AdminLoadError error={error} onRetry={reload} title="โหลดแนวโน้มไม่สำเร็จ" />
      ) : null}
      {ops ? (
        <DiscoveredChart days={ops.discoveredDaily} />
      ) : loading ? (
        <LoadingRegion>
          <Skeleton className="h-80 w-full rounded-xl" />
        </LoadingRegion>
      ) : null}
      <Link href="/admin/ingestion" className={cn(ADMIN_LINK, 'self-end')}>
        ดูแนวโน้มทั้งหมด
        <ArrowRight className="size-4" aria-hidden="true" />
      </Link>
    </section>
  );
}
