import { cn } from '@/lib/utils';

/** A grey block that pulses — but only for people who have not asked for less motion. */
function Block({ className }: { className?: string }) {
  return <div className={cn('bg-muted rounded-md motion-safe:animate-pulse', className)} />;
}

/**
 * The dashboard's shape, drawn empty while it loads.
 *
 * Sized like the content it stands in for — six tiles, a ring, five rows — so
 * nothing jumps when the data arrives.
 */
export function DashboardSkeleton() {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="กำลังโหลดข้อมูลแดชบอร์ด"
      className="flex flex-col gap-6"
    >
      <div className="bg-border grid grid-cols-2 gap-px overflow-hidden rounded-xl border sm:grid-cols-3 lg:grid-cols-6">
        {Array.from({ length: 6 }, (_, index) => (
          <div key={index} className="bg-card flex flex-col gap-2 p-4">
            <Block className="h-3 w-16" />
            <Block className="h-8 w-20" />
            <Block className="h-3 w-24" />
          </div>
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <div className="bg-card flex items-center gap-6 rounded-xl border p-6">
          <Block className="size-44 shrink-0 rounded-full" />
          <div className="flex w-full flex-col gap-3">
            {Array.from({ length: 6 }, (_, index) => (
              <Block key={index} className="h-4 w-full" />
            ))}
          </div>
        </div>
        <div className="bg-card flex flex-col gap-4 rounded-xl border p-6">
          {Array.from({ length: 5 }, (_, index) => (
            <div key={index} className="flex flex-col gap-2">
              <Block className="h-4 w-4/5" />
              <Block className="h-3 w-1/2" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
