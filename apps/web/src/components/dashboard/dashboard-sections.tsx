import Link from 'next/link';
import { ArrowUpRight, Building2, CalendarClock, Newspaper, Star } from 'lucide-react';
import { currentDeadline, STATUS_LABELS, type TorListItem } from '@torfun/types';
import { ProcurementStatusBadge } from '@/components/search/procurement-status-badge';
import { buttonVariants } from '@/components/ui/button';
import { deadlineLabel, deadlineText } from '@/lib/deadline-display';
import { formatCount } from '@/lib/format-number';
import { formatThaiDate } from '@/lib/format-date';
import type { Load, TodayAnnouncements, TrackedUpdates } from './use-dashboard-data';

/** A titled panel. The heading names it for assistive technology and for the tests. */
function Panel({
  id,
  icon,
  title,
  note,
  children,
}: {
  id: string;
  icon: React.ReactNode;
  title: string;
  note?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="bg-card rounded-3xl border p-6 sm:p-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h2 id={id} className="flex items-center gap-2.5 text-xl font-medium">
          {icon}
          {title}
        </h2>
        {note && <p className="text-muted-foreground text-sm">{note}</p>}
      </header>
      <div className="mt-6">{children}</div>
    </section>
  );
}

function Message({
  children,
  tone = 'muted',
}: {
  children: React.ReactNode;
  tone?: 'muted' | 'error';
}) {
  return (
    <p
      role={tone === 'error' ? 'alert' : undefined}
      className={tone === 'error' ? 'text-destructive text-sm' : 'text-muted-foreground text-sm'}
    >
      {children}
    </p>
  );
}

function ProcurementRow({ item }: { item: TorListItem }) {
  const deadline = currentDeadline(item);
  return (
    <li className="border-border border-b py-4 first:pt-0 last:border-b-0 last:pb-0">
      <div className="flex flex-wrap items-center gap-2">
        <ProcurementStatusBadge status={item.timeline.status} />
        {item.projectMoney !== null && (
          <span data-numeric className="text-muted-foreground text-sm">
            ฿{formatCount(item.projectMoney)}
          </span>
        )}
      </div>
      <Link
        href={`/tor/${encodeURIComponent(item.projectId)}`}
        className="focus-visible:outline-primary mt-2 inline-flex items-start gap-2 text-base leading-relaxed font-semibold underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-4"
      >
        {item.projectName}
        <ArrowUpRight aria-hidden="true" className="mt-1 size-4 shrink-0" />
      </Link>
      <p className="text-muted-foreground mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        <span className="inline-flex items-center gap-1.5">
          <Building2 aria-hidden="true" className="size-3.5 shrink-0" />
          {item.deptName}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <CalendarClock aria-hidden="true" className="size-3.5 shrink-0" />
          {deadlineLabel(deadline)} {deadlineText(deadline, item.timeline.status)}
        </span>
      </p>
    </li>
  );
}

export function TodayPanel({ load }: { load: Load<TodayAnnouncements> }) {
  return (
    <Panel
      id="today-heading"
      icon={<Newspaper aria-hidden="true" className="text-primary size-5" />}
      title="ประกาศใหม่วันนี้"
      note={
        load.state === 'ready' && load.value.total > 0 ? (
          <>ทั้งหมด {formatCount(load.value.total)} รายการ</>
        ) : undefined
      }
    >
      {load.state === 'loading' && <Message>กำลังโหลดประกาศใหม่...</Message>}
      {load.state === 'error' && <Message tone="error">{load.message}</Message>}
      {load.state === 'ready' && load.value.items.length === 0 && (
        <Message>ยังไม่มีประกาศใหม่วันนี้ ระบบจะแสดงที่นี่เมื่อดึงข้อมูลได้</Message>
      )}
      {load.state === 'ready' && load.value.items.length > 0 && (
        <>
          <ul>
            {load.value.items.map((item) => (
              <ProcurementRow key={item.projectId} item={item} />
            ))}
          </ul>
          {load.value.total > load.value.items.length && (
            <Link
              href="/search"
              className={buttonVariants({ variant: 'outline', size: 'sm', className: 'mt-6' })}
            >
              ดูประกาศทั้งหมด
            </Link>
          )}
        </>
      )}
    </Panel>
  );
}

export function TrackedPanel({ load }: { load: Load<TrackedUpdates> }) {
  return (
    <Panel
      id="tracked-heading"
      icon={<Star aria-hidden="true" className="text-primary size-5" />}
      title="ความเคลื่อนไหวของ TOR ที่ติดตาม"
      note={
        load.state === 'ready' && load.value.trackedTotal > 0 ? (
          <>บันทึกไว้ {formatCount(load.value.trackedTotal)} รายการ</>
        ) : undefined
      }
    >
      {load.state === 'loading' && <Message>กำลังโหลดรายการที่ติดตาม...</Message>}
      {load.state === 'error' && <Message tone="error">{load.message}</Message>}
      {load.state === 'ready' && load.value.trackedTotal === 0 && (
        <Message>
          ยังไม่ได้บันทึก TOR ไว้ติดตาม กดบันทึกจากหน้ารายละเอียด TOR
          เพื่อดูความเคลื่อนไหวของโครงการที่นี่
        </Message>
      )}
      {load.state === 'ready' && load.value.trackedTotal > 0 && (
        <>
          <h3 className="text-muted-foreground mb-3 text-sm font-medium">ใกล้ปิดรับก่อน</h3>
          <ul>
            {load.value.tracked.map(({ item }) => (
              <ProcurementRow key={item.projectId} item={item} />
            ))}
          </ul>
          <h3 className="text-muted-foreground mt-8 mb-3 text-sm font-medium">
            สถานะหรือกำหนดเวลาที่เปลี่ยนล่าสุด
          </h3>
          {load.value.changes.length === 0 ? (
            <Message>ยังไม่มีการเปลี่ยนแปลงที่บันทึกไว้</Message>
          ) : (
            <ul>
              {load.value.changes.map((change) => (
                <li
                  key={change.id}
                  className="border-border border-b py-3 first:pt-0 last:border-b-0 last:pb-0"
                >
                  <Link
                    href={`/tor/${encodeURIComponent(change.project_id)}`}
                    className="focus-visible:outline-primary text-sm font-semibold underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-4"
                  >
                    {change.project_name}
                  </Link>
                  <p className="text-muted-foreground mt-1 text-sm">
                    {change.previous_status
                      ? `${STATUS_LABELS[change.previous_status]} → ${STATUS_LABELS[change.status]}`
                      : STATUS_LABELS[change.status]}{' '}
                    · <time dateTime={change.created_at}>{formatThaiDate(change.created_at)}</time>
                  </p>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </Panel>
  );
}
