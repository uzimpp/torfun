import { Skeleton as Block } from '@/components/ui/skeleton';

/**
 * The dashboard's shape, drawn empty while it loads, sized like the content it
 * stands in for so nothing jumps when the data arrives.
 */
export function DashboardSkeleton() {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="กำลังโหลดข้อมูลแดชบอร์ด"
      className="grid gap-10 lg:grid-cols-[minmax(0,8fr)_minmax(0,4fr)]"
    >
      <div className="flex flex-col gap-10">
        <div className="flex flex-col gap-4">
          <Block className="h-8 w-48 rounded-full" />
          <div className="flex gap-2">
            <Block className="h-8 w-32 rounded-full" />
            <Block className="h-8 w-24 rounded-full" />
          </div>
        </div>
        <div className="bg-border grid grid-cols-2 gap-px overflow-hidden rounded-xl border sm:grid-cols-3">
          {Array.from({ length: 6 }, (_, index) => (
            <div key={index} className="bg-card flex flex-col gap-2 p-4">
              <Block className="h-3 w-16" />
              <Block className="h-7 w-20" />
              <Block className="h-3 w-24" />
            </div>
          ))}
        </div>
        <div className="flex flex-col gap-3">
          <Block className="h-5 w-28" />
          <div className="bg-card divide-y rounded-xl border">
            {Array.from({ length: 3 }, (_, index) => (
              <div key={index} className="flex flex-col gap-3 px-5 py-4">
                <Block className="h-4 w-3/5" />
                <Block className="h-3 w-2/5" />
                <Block className="h-7 w-64" />
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="flex flex-col gap-6 border-t pt-10 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-10">
        <Block className="mx-auto size-44 rounded-full" />
        <div className="flex flex-col gap-3">
          {Array.from({ length: 6 }, (_, index) => (
            <Block key={index} className="h-4 w-full" />
          ))}
        </div>
      </div>
    </div>
  );
}
