'use client';

import { Ban, Check, FileSearch, MoreHorizontal, Trash2 } from 'lucide-react';
import type { Procurement } from '@torfun/types';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { ProjectAction } from './project-action-dialog';

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
        {record.outcome === 'out_of_scope' ? (
          <DropdownMenuItem onClick={() => onChoose('readAnyway')}>
            <FileSearch aria-hidden="true" />
            อ่านเอกสารต่อ
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
