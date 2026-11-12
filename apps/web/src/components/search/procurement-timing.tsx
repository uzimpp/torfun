import Link from 'next/link';
import { CalendarDays, Clock3 } from 'lucide-react';
import { currentDeadline, procurementDay, type Procurement } from '@torfun/types';

const dateFormat = new Intl.DateTimeFormat('th-TH', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});

const formatDate = (day: string) => dateFormat.format(new Date(`${day}T00:00:00Z`));

export function ProcurementTiming({
  item,
  mode = 'all',
  returnTo,
}: {
  item: Procurement;
  mode?: 'all' | 'published' | 'deadline' | 'details';
  returnTo?: string;
}) {
  const current = currentDeadline(item);
  const deadline = procurementDay(current?.at);
  const published = procurementDay(item.announceDate);

  if (mode === 'published') {
    return published ? <>ประกาศ {formatDate(published)}</> : null;
  }
  if (mode === 'deadline') {
    return <>{deadline ? `ปิดรับ ${formatDate(deadline)}` : 'ยังไม่ทราบวันปิดรับข้อเสนอ'}</>;
  }

  if (mode === 'details') {
    if (!deadline || !current?.readByModel) return null;

    return (
      <div className="text-muted-foreground mt-2 text-xs">
        วันที่สกัดโดย AI ·{' '}
        <Link
          href={returnTo ?? `/tor/${encodeURIComponent(item.projectId)}`}
          className="hover:text-primary pointer-events-auto relative z-20 underline underline-offset-4"
        >
          ตรวจสอบ TOR ต้นฉบับ
        </Link>
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
              href={returnTo ?? `/tor/${encodeURIComponent(item.projectId)}`}
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
