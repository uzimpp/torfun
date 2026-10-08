import Link from 'next/link';
import { CalendarDays, Clock3 } from 'lucide-react';
import { daysUntil, procurementDay, type Procurement } from '@torfun/types';
import { cn } from '@/lib/utils';

const dateFormat = new Intl.DateTimeFormat('th-TH', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});
const formatDate = (day: string) => dateFormat.format(new Date(`${day}T00:00:00Z`));

/** The days-left badge: biggest on open tenders, a hint on drafts, nothing otherwise. */
export function DaysLeftBadge({ item, today }: { item: Procurement; today: string }) {
  const deadline = procurementDay(item.deadlineAt);
  const remaining = deadline ? daysUntil(deadline, today) : null;
  const base = 'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm tabular-nums';

  if (item.status === 'drafting') {
    return (
      <span className={cn(base, 'bg-primary/10 text-primary font-medium')}>
        เตรียมตัวก่อนเปิดรับข้อเสนอ
      </span>
    );
  }
  if (item.status !== 'open' || remaining === null) return null;
  if (remaining < 0) {
    return (
      <span className={cn(base, 'bg-muted text-muted-foreground')}>
        พ้นกำหนดตาม TOR แล้ว {Math.abs(remaining)} วัน
      </span>
    );
  }
  return (
    <span
      className={cn(
        base,
        'font-semibold',
        remaining <= 3 ? 'bg-destructive/10 text-destructive' : 'bg-primary/10 text-primary',
      )}
    >
      <Clock3 aria-hidden="true" className="size-4" />
      {remaining === 0 ? 'ครบกำหนดวันนี้' : `เหลืออีก ${remaining} วัน`}
    </span>
  );
}

/** Announcement date and deadline, with where the deadline came from. */
export function ProcurementTiming({ item }: { item: Procurement }) {
  const deadline = procurementDay(item.deadlineAt);
  const published = procurementDay(item.announceDate);

  return (
    <div className="mt-3">
      <div className="text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
        {published && (
          <span className="inline-flex items-center gap-1.5">
            <CalendarDays aria-hidden="true" className="size-3.5" />
            ประกาศ {formatDate(published)}
          </span>
        )}
        <span>
          {deadline ? `กำหนดส่งตาม TOR ${formatDate(deadline)}` : 'ยังไม่ทราบวันปิดรับข้อเสนอ'}
        </span>
        {deadline && item.deadlineSource === 'tor' && (
          <span>
            วันที่สกัดโดย AI ·{' '}
            <Link
              href={`/tor/${encodeURIComponent(item.projectId)}`}
              className="hover:text-primary underline underline-offset-4"
            >
              ตรวจสอบ TOR ต้นฉบับ
            </Link>
          </span>
        )}
      </div>
    </div>
  );
}
