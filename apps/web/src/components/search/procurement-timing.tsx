import Link from 'next/link';
import { CalendarDays, Clock3 } from 'lucide-react';
import { daysUntil, procurementDay, STATUS_LABELS, type Procurement } from '@torfun/types';
import { cn } from '@/lib/utils';

const dateFormat = new Intl.DateTimeFormat('th-TH', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});
const formatDate = (day: string) => dateFormat.format(new Date(`${day}T00:00:00Z`));

export function ProcurementTiming({ item, today }: { item: Procurement; today: string }) {
  const deadline = procurementDay(item.deadlineAt);
  const remaining = deadline ? daysUntil(deadline, today) : null;
  const invitation = item.status === 'open' && item.winner === null;
  const upcoming = invitation && remaining !== null && remaining >= 0;
  const expired = invitation && remaining !== null && remaining < 0;
  const published = procurementDay(item.announceDate);

  return (
    <div className="mt-3 space-y-2">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span
          className={cn(
            'rounded-md px-2.5 py-1 font-medium',
            item.status === 'drafting' ? 'bg-primary/10 text-primary' : 'bg-muted text-foreground',
          )}
        >
          {item.status === 'open' ? 'ประกาศเชิญชวน' : STATUS_LABELS[item.status]}
        </span>
        {item.status === 'drafting' && (
          <span className="text-primary">เตรียมตัวก่อนเปิดรับข้อเสนอ</span>
        )}
        {upcoming && (
          <span
            className={cn(
              'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 font-semibold tabular-nums',
              remaining <= 3 ? 'bg-destructive/10 text-destructive' : 'bg-primary/10 text-primary',
            )}
          >
            <Clock3 aria-hidden="true" className="size-3.5" />
            {remaining === 0 ? 'ครบกำหนดวันนี้' : `เหลืออีก ${remaining} วัน`}
          </span>
        )}
        {expired && (
          <span className="text-muted-foreground">
            พ้นกำหนดตาม TOR แล้ว {Math.abs(remaining)} วัน
          </span>
        )}
        {item.winner && item.status === 'open' && (
          <span className="text-muted-foreground">มีผู้ชนะแล้ว</span>
        )}
      </div>
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
