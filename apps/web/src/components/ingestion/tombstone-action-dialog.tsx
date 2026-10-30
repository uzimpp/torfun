'use client';

import { ListX, RefreshCw } from 'lucide-react';
import type { Tombstone } from '@torfun/types';
import { removeTombstone, restoreTombstone } from '@/lib/api-tombstones';
import { ConfirmDialog } from './confirm-dialog';
import { useAdminAction } from './use-admin-action';

export type TombstoneAction = 'remove' | 'restore';

/**
 * The confirmation for an action on one Non-software entry. The two differ in
 * cost, and the wording says which: removing only unblocks the project, while
 * restoring queues a read that downloads from the upstream site.
 */
export function TombstoneActionDialog({
  tombstone,
  action,
  onClose,
  onDone,
}: {
  tombstone: Tombstone;
  action: TombstoneAction;
  onClose: () => void;
  /** Called after the API accepted the action, before the dialog closes. */
  onDone: (action: TombstoneAction) => void;
}) {
  const request = useAdminAction();
  const { projectId } = tombstone;

  const copy = {
    remove: {
      title: 'ลบออกจากรายการ?',
      description:
        'ลบเฉพาะ Tombstone ของโครงการนี้ ยังไม่มีการดาวน์โหลดใดๆ แต่รอบดึงข้อมูลถัดไปอาจนำโครงการนี้กลับมาได้',
      confirmLabel: 'ลบออกจากรายการ',
      icon: ListX,
      fallback: 'ลบออกจากรายการไม่สำเร็จ ลองอีกครั้ง',
      send: () => removeTombstone(projectId),
    },
    restore: {
      title: 'ดึงข้อมูลใหม่?',
      description:
        'ลบ Tombstone แล้วอ่านโครงการนี้ใหม่ 1 ครั้ง ซึ่งต้องดาวน์โหลดเอกสารจากเว็บไซต์ต้นทาง (gprocurement.go.th)',
      confirmLabel: 'ดึงข้อมูลใหม่',
      icon: RefreshCw,
      fallback: 'ดึงข้อมูลใหม่ไม่สำเร็จ ลองอีกครั้ง',
      send: () => restoreTombstone(projectId),
    },
  }[action];

  const confirm = async () => {
    if (await request.run(copy.send, copy.fallback)) {
      onDone(action);
      onClose();
    }
  };

  return (
    <ConfirmDialog
      title={copy.title}
      description={
        <>
          <code className="block text-xs">{projectId}</code>
          {copy.description}
        </>
      }
      confirmLabel={copy.confirmLabel}
      confirmIcon={copy.icon}
      action={request}
      onConfirm={() => void confirm()}
      onCancel={onClose}
    />
  );
}
