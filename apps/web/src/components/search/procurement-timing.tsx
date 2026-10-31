import Link from 'next/link';
import { CalendarDays, Clock3 } from 'lucide-react';
import { currentDeadline, daysUntil, procurementDay, type Procurement } from '@torfun/types';
import { cn } from '@/lib/utils';

const dateFormat = new Intl.DateTimeFormat('th-TH', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});

const formatDate = (day: string) => dateFormat.format(new Date(`${day}T00:00:00Z`));

export function DaysLeftBadge({ item, today }: { item: Procurement; today: string }) {
  const deadline = procurementDay(currentDeadline(item)?.at);
  const remaining = deadline ? daysUntil(deadline, today) : null;
  const base = 'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm tabular-nums';

  if (item.timeline.status === 'drafting') {
    return (
      <span className={cn(base, 'bg-primary/10 text-primary font-medium')}>
        เตรียมตัวก่อนเปิดรับข้อเสนอ
      </span>
    );
  }
  if (item.timeline.status !== 'open' || remaining === null) return null;
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

export function ProcurementTiming({
  item,
  today,
  mode = 'all',
}: {
  item: Procurement;
  today: string;
  mode?: 'all' | 'published' | 'deadline' | 'details';
}) {
  const current = currentDeadline(item);
  const deadline = procurementDay(current?.at);
  const published = procurementDay(item.announceDate);
  const remaining = deadline ? daysUntil(deadline, today) : null;
  const expired = item.timeline.status === 'open' && remaining !== null && remaining < 0;

  if (mode === 'published') {
    return published ? <>ประกาศ {formatDate(published)}</> : null;
  }
  if (mode === 'deadline') {
    return <>{deadline ? `ปิดรับ ${formatDate(deadline)}` : 'ยังไม่ทราบวันปิดรับข้อเสนอ'}</>;
  }

  if (mode === 'details') {
    return (
      <div className="text-muted-foreground mt-2 space-y-1 text-xs">
        {(item.timeline.status === 'drafting' || expired) && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {item.timeline.status === 'drafting' && (
              <span className="text-primary">เตรียมตัวก่อนเปิดรับข้อเสนอ</span>
            )}
            {expired && remaining !== null && (
              <span>พ้นกำหนดตาม TOR แล้ว {Math.abs(remaining)} วัน</span>
            )}
          </div>
        )}
        {deadline && current?.readByModel && (
          <div>
            วันที่สกัดโดย AI ·{' '}
            <Link
              href={`/tor/${encodeURIComponent(item.projectId)}`}
              className="hover:text-primary pointer-events-auto relative z-20 underline underline-offset-4"
            >
              ตรวจสอบ TOR ต้นฉบับ
            </Link>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="mt-3">
      <div className="text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
        {published && (
          <span className="inline-flex items-center gap-1.5">
            <CalendarDays aria-hidden="true" className="size-3.5" />
            ประกาศ {formatDate(published)}
          </span>
        )}
        <span className="inline-flex items-center gap-1.5">
          <Clock3 aria-hidden="true" className="size-3.5" />
          {deadline ? `กำหนดส่งตาม TOR ${formatDate(deadline)}` : 'ยังไม่ทราบวันปิดรับข้อเสนอ'}
        </span>
        {deadline && current?.readByModel && (
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
