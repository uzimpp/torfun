'use client';

import { MoreHorizontal } from 'lucide-react';
import type { Procurement } from '@torfun/types';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { ProjectAction } from './project-action-dialog';

/**
 * The administrator's actions on one row. Approve is offered only where there is
 * something to approve — a record held for review. Choosing one only names the
 * action; the table owns the confirmation.
 */
export function ProjectActionMenu({
  record,
  onChoose,
}: {
  record: Procurement;
  onChoose: (action: ProjectAction) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="ghost" size="icon" aria-label="การดำเนินการกับโครงการนี้" />}
      >
        <MoreHorizontal aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-auto">
        {record.outcome === 'needs_review' ? (
          <DropdownMenuItem onClick={() => onChoose('approve')}>อนุมัติ</DropdownMenuItem>
        ) : null}
        <DropdownMenuItem onClick={() => onChoose('nonSoftware')}>
          ระบุว่าไม่ใช่ซอฟต์แวร์
        </DropdownMenuItem>
        <DropdownMenuItem variant="destructive" onClick={() => onChoose('delete')}>
          ลบ
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
