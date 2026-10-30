import Link from 'next/link';
import { ArrowUpRight, Check, X } from 'lucide-react';
import { STATUS_LABELS, type NotificationResponse } from '@torfun/types';
import { Button } from '@/components/ui/button';

export function NotificationItem({
  item,
  busy,
  onAction,
}: {
  item: NotificationResponse;
  busy: boolean;
  onAction: (id: string, action: 'read' | 'dismiss') => void;
}) {
  return (
    <li
      className={`border-border relative border-b px-5 py-6 sm:px-6 ${item.read_at ? '' : 'bg-primary/5'}`}
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className={`mt-2 size-2 shrink-0 rounded-full ${item.read_at ? 'bg-muted' : 'bg-primary'}`}
        />
        <div className="min-w-0 flex-1">
          <div className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
            <span>{item.event === 'match_found' ? 'ตรงกับผลงานบริษัท' : 'สถานะเปลี่ยนแปลง'}</span>
            {!item.read_at && <span className="text-primary font-medium">ยังไม่อ่าน</span>}
            <time dateTime={item.created_at}>
              {new Intl.DateTimeFormat('th-TH', {
                dateStyle: 'medium',
                timeStyle: 'short',
                timeZone: 'Asia/Bangkok',
              }).format(new Date(item.created_at))}
            </time>
          </div>
          <Link
            href={`/tor/${encodeURIComponent(item.project_id)}`}
            onClick={() => {
              if (!item.read_at) onAction(item.id, 'read');
            }}
            className="focus-visible:outline-primary mt-2 inline-flex items-start gap-2 text-base leading-relaxed font-semibold underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-4"
          >
            {item.project_name}
            <ArrowUpRight aria-hidden="true" className="mt-1 size-4 shrink-0" />
          </Link>
          <p className="text-muted-foreground mt-2 text-sm">
            คะแนนเทคโนโลยีและแพลตฟอร์ม {Math.round(item.score * 100)}% · ค่าประมาณจากข้อมูลที่บันทึก
          </p>
          {item.reasons.length > 0 && (
            <ul className="mt-3 space-y-1 text-sm">
              {item.reasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          )}
          {item.event === 'status_changed' && (
            <p className="mt-3 text-sm">
              {item.previous_status && `${STATUS_LABELS[item.previous_status]} → `}
              {STATUS_LABELS[item.status]}
            </p>
          )}
          <p className="text-muted-foreground mt-3 text-xs">
            {item.deadline_at ? `กำหนดยื่นข้อเสนอ: ${item.deadline_at} · ` : ''}
            ตรวจสอบคุณสมบัติและกำหนดเวลาจากเอกสารต้นฉบับก่อนยื่นข้อเสนอ
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {!item.read_at && (
              <Button
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={() => onAction(item.id, 'read')}
              >
                <Check aria-hidden="true" />
                ทำเครื่องหมายว่าอ่านแล้ว<span className="sr-only">: {item.project_name}</span>
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() => onAction(item.id, 'dismiss')}
            >
              <X aria-hidden="true" />
              ซ่อนการแจ้งเตือน<span className="sr-only">: {item.project_name}</span>
            </Button>
          </div>
        </div>
      </div>
    </li>
  );
}
