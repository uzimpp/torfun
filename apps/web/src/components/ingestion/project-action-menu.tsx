'use client';

import { Ban, Check, MoreHorizontal, Trash2 } from 'lucide-react';
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
          <DropdownMenuItem onClick={() => onChoose('approve')}>
            <Check aria-hidden="true" />
            อนุมัติ
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem onClick={() => onChoose('nonSoftware')}>
          <Ban aria-hidden="true" />
          ระบุว่าไม่ใช่ซอฟต์แวร์
        </DropdownMenuItem>
        <DropdownMenuItem variant="destructive" onClick={() => onChoose('delete')}>
          <Trash2 aria-hidden="true" />
          ลบ
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
