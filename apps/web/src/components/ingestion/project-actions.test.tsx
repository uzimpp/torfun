import { useState } from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { EMPTY_MILESTONES, type Procurement } from '@torfun/types';

import { ApiError, SessionEndedError } from '@/lib/api';
import { ProjectActionDialog, type ProjectAction } from './project-action-dialog';
import { ProjectActionMenu } from './project-action-menu';

/**
 * The per-record action menu and the Thai confirmation dialogs behind it, wired
 * the way the procurement list and drawer wire them. The API does not exist as
 * far as these tests are concerned.
 */
vi.mock('@/lib/api-procurement-actions', () => ({
  approveProcurement: vi.fn(),
  markNonSoftware: vi.fn(),
  deleteProcurement: vi.fn(),
}));
const actions = vi.mocked(await import('@/lib/api-procurement-actions'));

function record(overrides: Partial<Procurement> = {}): Procurement {
  return {
    projectId: '67109288963',
    projectName: 'ประกวดราคาจ้างพัฒนาระบบสารสนเทศ',
    deptName: 'กรุงเทพมหานคร',
    deptSubName: null,
    deptCode: '3100001',
    budgetYear: 2568,
    typeId: null,
    goodsId: null,
    detailCheckedAt: '2026-09-01T00:00:00.000Z',
    announceDate: null,
    projectTypeName: null,
    purchaseMethodName: null,
    projectMoney: null,
    priceBuild: null,
    status: 'unknown',
    milestones: EMPTY_MILESTONES,
    timelineCheckedAt: null,
    deadlineAt: null,
    deadlineSource: null,
    state: 'Completed',
    outcome: 'tor_analysed',
    attempts: 0,
    holdReason: null,
    approvedBy: null,
    approvedAt: null,
    statusHistory: [],
    zipId: null,
    documents: [],
    analysis: null,
    torAmbiguous: false,
    discoveredAt: '2026-09-01T00:00:00.000Z',
    sourceHash: null,
    updatedAt: '2026-09-01T00:00:00.000Z',
    ...overrides,
  };
}

const held = () =>
  record({ outcome: 'needs_review', state: 'Completed', holdReason: 'ai_low_confidence' });

function MenuWithDialog({ record, onChanged }: { record: Procurement; onChanged: () => void }) {
  const [action, setAction] = useState<ProjectAction | null>(null);
  return (
    <>
      <ProjectActionMenu record={record} onChoose={setAction} />
      {action ? (
        <ProjectActionDialog
          record={record}
          action={action}
          onClose={() => setAction(null)}
          onDone={onChanged}
        />
      ) : null}
    </>
  );
}

function renderMenu(project: Procurement, onChanged = vi.fn()) {
  render(<MenuWithDialog record={project} onChanged={onChanged} />);
  return { onChanged };
}

const openMenu = async () =>
  userEvent.click(screen.getByRole('button', { name: 'การดำเนินการกับโครงการนี้' }));

beforeEach(() => vi.resetAllMocks());

describe('the action menu', () => {
  test('offers Approve only on a held record', async () => {
    renderMenu(record());
    await openMenu();
    expect(
      await screen.findByRole('menuitem', { name: 'ระบุว่าไม่ใช่ซอฟต์แวร์' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'อนุมัติ' })).not.toBeInTheDocument();
    expect(await screen.findByRole('menuitem', { name: 'ลบ' })).toBeInTheDocument();
  });

  test('offers Approve on a held record', async () => {
    renderMenu(held());
    await openMenu();
    expect(await screen.findByRole('menuitem', { name: 'อนุมัติ' })).toBeInTheDocument();
  });
});

describe('approving', () => {
  test('asks first, then approves, closes and reports the change', async () => {
    actions.approveProcurement.mockResolvedValue(undefined);
    const { onChanged } = renderMenu(held());

    await openMenu();
    await userEvent.click(await screen.findByRole('menuitem', { name: 'อนุมัติ' }));
    const dialog = await screen.findByRole('dialog', { name: /อนุมัติ/ });
    expect(actions.approveProcurement).not.toHaveBeenCalled();

    await userEvent.click(within(dialog).getByRole('button', { name: 'อนุมัติ' }));

    expect(actions.approveProcurement).toHaveBeenCalledWith('67109288963');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(onChanged).toHaveBeenCalledTimes(1);
  });

  test('Escape closes the dialog without doing anything', async () => {
    renderMenu(held());
    await openMenu();
    await userEvent.click(await screen.findByRole('menuitem', { name: 'อนุมัติ' }));
    await screen.findByRole('dialog');

    await userEvent.keyboard('{Escape}');

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(actions.approveProcurement).not.toHaveBeenCalled();
  });

  test('while the request is in flight the buttons are disabled so it cannot be sent twice', async () => {
    let finish!: () => void;
    actions.approveProcurement.mockReturnValue(new Promise<void>((resolve) => (finish = resolve)));
    renderMenu(held());
    await openMenu();
    await userEvent.click(await screen.findByRole('menuitem', { name: 'อนุมัติ' }));
    const dialog = await screen.findByRole('dialog');

    await userEvent.click(within(dialog).getByRole('button', { name: 'อนุมัติ' }));

    expect(within(dialog).getByRole('button', { name: /กำลังดำเนินการ/ })).toBeDisabled();
    expect(within(dialog).getByRole('button', { name: 'ยกเลิก' })).toBeDisabled();
    finish();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  test('a refusal stays in the dialog as an alert and nothing reloads', async () => {
    actions.approveProcurement.mockRejectedValue(new ApiError('ไม่พบโครงการ', 404));
    const { onChanged } = renderMenu(held());
    await openMenu();
    await userEvent.click(await screen.findByRole('menuitem', { name: 'อนุมัติ' }));
    const dialog = await screen.findByRole('dialog');

    await userEvent.click(within(dialog).getByRole('button', { name: 'อนุมัติ' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('ไม่พบโครงการ');
    expect(within(dialog).getByRole('button', { name: 'อนุมัติ' })).toBeEnabled();
    expect(onChanged).not.toHaveBeenCalled();
  });

  test('an ended session says so and offers sign-in instead of a retry', async () => {
    actions.approveProcurement.mockRejectedValue(new SessionEndedError());
    renderMenu(held());
    await openMenu();
    await userEvent.click(await screen.findByRole('menuitem', { name: 'อนุมัติ' }));
    const dialog = await screen.findByRole('dialog');

    await userEvent.click(within(dialog).getByRole('button', { name: 'อนุมัติ' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('เซสชันหมดอายุ');
    expect(within(dialog).getByRole('link', { name: 'เข้าสู่ระบบอีกครั้ง' })).toHaveAttribute(
      'href',
      '/login',
    );
    expect(within(dialog).queryByRole('button', { name: 'อนุมัติ' })).not.toBeInTheDocument();
  });
});

describe('marking as non-software', () => {
  test('confirms in Thai, then marks the project', async () => {
    actions.markNonSoftware.mockResolvedValue(undefined);
    const { onChanged } = renderMenu(record());
    await openMenu();
    await userEvent.click(await screen.findByRole('menuitem', { name: 'ระบุว่าไม่ใช่ซอฟต์แวร์' }));
    const dialog = await screen.findByRole('dialog', { name: /ไม่ใช่งานซอฟต์แวร์/ });

    await userEvent.click(within(dialog).getByRole('button', { name: 'ระบุว่าไม่ใช่ซอฟต์แวร์' }));

    expect(actions.markNonSoftware).toHaveBeenCalledWith('67109288963');
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });
});

describe('deleting', () => {
  async function openDelete() {
    await openMenu();
    await userEvent.click(await screen.findByRole('menuitem', { name: 'ลบ' }));
    return screen.findByRole('dialog', { name: /ลบโครงการ/ });
  }

  test('defaults to blocking a re-import, so confirming straight away records a tombstone', async () => {
    actions.deleteProcurement.mockResolvedValue(undefined);
    renderMenu(record());
    const dialog = await openDelete();

    expect(
      within(dialog).getByRole('radio', { name: 'ไม่ให้ดึงอีก (บันทึกใน Tombstone)' }),
    ).toBeChecked();
    expect(
      within(dialog).getByRole('radio', { name: 'ให้ระบบดึงโครงการนี้อีกได้' }),
    ).not.toBeChecked();

    await userEvent.click(within(dialog).getByRole('button', { name: 'ลบโครงการ' }));

    expect(actions.deleteProcurement).toHaveBeenCalledWith('67109288963', false);
  });

  test('choosing to allow the runner to pull it again sends allowReimport=true', async () => {
    actions.deleteProcurement.mockResolvedValue(undefined);
    renderMenu(record());
    const dialog = await openDelete();

    await userEvent.click(
      within(dialog).getByRole('radio', { name: 'ให้ระบบดึงโครงการนี้อีกได้' }),
    );
    await userEvent.click(within(dialog).getByRole('button', { name: 'ลบโครงการ' }));

    expect(actions.deleteProcurement).toHaveBeenCalledWith('67109288963', true);
  });

  test('the choice is not carried over to the next time the dialog opens', async () => {
    renderMenu(record());
    let dialog = await openDelete();
    await userEvent.click(
      within(dialog).getByRole('radio', { name: 'ให้ระบบดึงโครงการนี้อีกได้' }),
    );
    await userEvent.click(within(dialog).getByRole('button', { name: 'ยกเลิก' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    dialog = await openDelete();

    expect(
      within(dialog).getByRole('radio', { name: 'ไม่ให้ดึงอีก (บันทึกใน Tombstone)' }),
    ).toBeChecked();
  });
});
