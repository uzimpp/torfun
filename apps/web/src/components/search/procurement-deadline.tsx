import { Clock3 } from 'lucide-react';
import type { ProcurementStatus } from '@torfun/types';

import { deadlineText } from '@/lib/deadline-display';

/** The bid deadline as a result row shows it. Its source is shown on the review page, not here. */
export function ProcurementDeadline({
  deadlineAt,
  status,
}: {
  deadlineAt: string | null;
  status: ProcurementStatus;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 text-sm">
      <Clock3 aria-hidden="true" className="size-3.5 shrink-0 text-amber-600" />
      <span className="text-muted-foreground">กำหนดยื่นข้อเสนอ</span>
      <span data-numeric className="text-foreground font-medium">
        {deadlineText(deadlineAt, status)}
      </span>
    </span>
  );
}
