import type { TorStatus } from '@torfun/types';
import { cn } from '@/lib/utils';

const statusStyles: Record<TorStatus, { label: string; className: string }> = {
  draft: {
    label: 'ร่าง',
    className: 'bg-[#f5f1ff] text-[#775ac1]',
  },
  published: {
    label: 'ประกาศ',
    className: 'bg-[#eaf8f3] text-[#23856e]',
  },
};

export function TorStatusBadge({ status }: { status: TorStatus }) {
  const { label, className } = statusStyles[status];
  return (
    <span className={cn('rounded-full px-2.5 py-1 text-xs font-medium whitespace-nowrap', className)}>
      สถานะ: {label}
    </span>
  );
}
