'use client';

import { useState } from 'react';
import type { Procurement } from '@torfun/types';
import {
  approveProcurement,
  deleteProcurement,
  markNonSoftware,
} from '@/lib/api-procurement-actions';
import { ConfirmDialog } from './confirm-dialog';
import { useAdminAction } from './use-admin-action';

export type ProjectAction = 'approve' | 'nonSoftware' | 'delete';

/** The two answers to "may the runner pull this project again?" */
const REIMPORT_CHOICES = [
  { allow: true, label: 'ให้ระบบดึงโครงการนี้อีกได้' },
  { allow: false, label: 'ไม่ให้ดึงอีก (บันทึกใน Tombstone)' },
] as const;

/**
 * The confirmation for an administrator action on one procurement record. Mount
 * it only while an action is chosen, so each opening starts from the safe
 * default: a delete blocks a re-import until the person says otherwise.
 */
export function ProjectActionDialog({
  record,
  action,
  onClose,
  onDone,
}: {
  record: Procurement;
  action: ProjectAction;
  onClose: () => void;
  /** Called after the API accepted the action, before the dialog closes. */
  onDone: () => void;
}) {
  const [allowReimport, setAllowReimport] = useState(false);
  const request = useAdminAction();
  const { projectId, projectName } = record;

  const copy = {
    approve: {
      title: 'อนุมัติให้เจ้าหน้าที่เห็นโครงการนี้?',
      description: 'โครงการจะแสดงให้เจ้าหน้าที่ฝ่ายพัฒนาธุรกิจ ระบบจะบันทึกผู้อนุมัติและเวลา',
      confirmLabel: 'อนุมัติ',
      fallback: 'อนุมัติไม่สำเร็จ ลองอีกครั้ง',
      send: () => approveProcurement(projectId),
    },
    nonSoftware: {
      title: 'ระบุว่าไม่ใช่งานซอฟต์แวร์?',
      description:
        'เนื้อหาที่อ่านจาก TOR จะถูกลบ และโครงการจะถูกบันทึกใน Tombstone เพื่อไม่ให้ดึงซ้ำ ดูหรือนำกลับได้ที่รายการ Non-software',
      confirmLabel: 'ระบุว่าไม่ใช่ซอฟต์แวร์',
      fallback: 'บันทึกไม่สำเร็จ ลองอีกครั้ง',
      send: () => markNonSoftware(projectId),
    },
    delete: {
      title: 'ลบโครงการนี้?',
      description: 'ระเบียนของโครงการจะถูกลบ เลือกว่าให้รอบดึงข้อมูลนำกลับมาได้อีกหรือไม่',
      confirmLabel: 'ลบโครงการ',
      fallback: 'ลบไม่สำเร็จ ลองอีกครั้ง',
      send: () => deleteProcurement(projectId, allowReimport),
    },
  }[action];

  const confirm = async () => {
    if (await request.run(copy.send, copy.fallback)) {
      onDone();
      onClose();
    }
  };

  return (
    <ConfirmDialog
      title={copy.title}
      description={
        <>
          <span className="block font-medium break-words">{projectName}</span>
          {copy.description}
        </>
      }
      confirmLabel={copy.confirmLabel}
      destructive={action !== 'approve'}
      action={request}
      onConfirm={() => void confirm()}
      onCancel={onClose}
    >
      {action === 'delete' ? (
        <fieldset disabled={request.pending} className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-medium">การดึงข้อมูลซ้ำ</legend>
          {REIMPORT_CHOICES.map(({ allow, label }) => (
            <label key={label} className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="allow-reimport"
                checked={allowReimport === allow}
                onChange={() => setAllowReimport(allow)}
              />
              {label}
            </label>
          ))}
        </fieldset>
      ) : null}
    </ConfirmDialog>
  );
}
