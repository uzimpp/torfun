import { Clock3 } from 'lucide-react';
import type { CurrentDeadline, ProcurementStatus } from '@torfun/types';

import { deadlineLabel, deadlineText } from '@/lib/deadline-display';

export function ProcurementDeadline({
  deadline,
  status,
}: {
  deadline: CurrentDeadline | null;
  status: ProcurementStatus;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 text-sm">
      <Clock3 aria-hidden="true" className="size-3.5 shrink-0 text-amber-600" />
      <span className="text-muted-foreground">{deadlineLabel(deadline)}</span>
      <span data-numeric className="text-foreground font-medium">
        {deadlineText(deadline, status)}
      </span>
    </span>
  );
}
