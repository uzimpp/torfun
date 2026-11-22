import { render, renderHook, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { TOMBSTONE_REASON_LABELS, type Tombstone } from '@torfun/types';

import { ApiError, SessionEndedError } from '@/lib/api';
import { DroppedList } from './dropped-list';
import { useDroppedList } from './use-dropped-list';

vi.mock('@/lib/api-tombstones', () => ({
  fetchTombstones: vi.fn(),
  restoreTombstone: vi.fn(),
  removeTombstone: vi.fn(),
}));
const api = vi.mocked(await import('@/lib/api-tombstones'));

const dropped: Tombstone = {
  projectId: '66059313551',
  reason: 'ai_not_software',
  evidence: 'จัดซื้อเครื่องคอมพิวเตอร์ 50 เครื่อง',
  promptVersion: '2026-10-01.1',
  decidedAt: '2026-10-02T00:00:00.000Z',
  decidedBy: null,
};

function Harness() {
  return <DroppedList dropped={useDroppedList(true)} />;
}

beforeEach(() => vi.resetAllMocks());

describe('DroppedList', () => {
  test('reads nothing until its tab is open', () => {
    renderHook(() => useDroppedList(false));
    expect(api.fetchTombstones).not.toHaveBeenCalled();
  });

  test('shows why each project went and the passage that decided it', async () => {
    api.fetchTombstones.mockResolvedValue([dropped]);
    render(<Harness />);

    const row = await screen.findByRole('listitem');
    expect(within(row).getByText(TOMBSTONE_REASON_LABELS.ai_not_software)).toBeInTheDocument();
    expect(within(row).getByText(/จัดซื้อเครื่องคอมพิวเตอร์ 50 เครื่อง/)).toBeInTheDocument();
    expect(within(row).getByText('66059313551')).toBeInTheDocument();
  });

  test('restoring says it downloads upstream, then notes the project is queued', async () => {
    api.fetchTombstones.mockResolvedValueOnce([dropped]).mockResolvedValue([]);
    api.restoreTombstone.mockResolvedValue(undefined);
    render(<Harness />);

    await userEvent.click(await screen.findByRole('button', { name: 'ดึงข้อมูลใหม่' }));
    const dialog = await screen.findByRole('dialog', { name: /ดึงข้อมูลใหม่/ });
    expect(dialog).toHaveTextContent(/gprocurement\.go\.th/);
    await userEvent.click(within(dialog).getByRole('button', { name: 'ดึงข้อมูลใหม่' }));

    expect(api.restoreTombstone).toHaveBeenCalledWith('66059313551');
    expect(await screen.findByRole('status')).toHaveTextContent('จัดคิวอ่านใหม่แล้ว');
    await waitFor(() =>
      expect(screen.getByText('ยังไม่มีโครงการที่ถูกคัดออก')).toBeInTheDocument(),
    );
  });

  test('says plainly when nothing has been dropped', async () => {
    api.fetchTombstones.mockResolvedValue([]);
    render(<Harness />);

    expect(await screen.findByText('ยังไม่มีโครงการที่ถูกคัดออก')).toBeInTheDocument();
  });

  test('says which administrator decided, when a person did', async () => {
    api.fetchTombstones.mockResolvedValue([
      { ...dropped, reason: 'admin_deleted', promptVersion: null, decidedBy: 'somchai' },
    ]);
    render(<Harness />);

    const row = await screen.findByRole('listitem');
    expect(within(row).getByText(TOMBSTONE_REASON_LABELS.admin_deleted)).toBeInTheDocument();
    expect(within(row).getByText(/somchai/)).toBeInTheDocument();
  });

  describe('removing the tombstone', () => {
    const open = async () => {
      await userEvent.click(await screen.findByRole('button', { name: 'ลบออกจากรายการ' }));
      return screen.findByRole('dialog', { name: /ลบออกจากรายการ/ });
    };

    test('says it only unblocks the project, then removes it and reloads', async () => {
      api.fetchTombstones.mockResolvedValueOnce([dropped]).mockResolvedValue([]);
      api.removeTombstone.mockResolvedValue(undefined);
      render(<Harness />);

      const dialog = await open();
      expect(dialog).toHaveTextContent(/รอบดึงข้อมูลถัดไปอาจนำโครงการนี้กลับมา/);
      expect(api.removeTombstone).not.toHaveBeenCalled();
      await userEvent.click(within(dialog).getByRole('button', { name: 'ลบออกจากรายการ' }));

      expect(api.removeTombstone).toHaveBeenCalledWith('66059313551');
      expect(await screen.findByText('ยังไม่มีโครงการที่ถูกคัดออก')).toBeInTheDocument();
      expect(api.restoreTombstone).not.toHaveBeenCalled();
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });

    test('Escape leaves everything as it was', async () => {
      api.fetchTombstones.mockResolvedValue([dropped]);
      render(<Harness />);
      await open();

      await userEvent.keyboard('{Escape}');

      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      expect(api.removeTombstone).not.toHaveBeenCalled();
      expect(screen.getByRole('listitem')).toBeInTheDocument();
    });
  });

  describe('a restore that does not go through', () => {
    const confirmRestore = async () => {
      await userEvent.click(await screen.findByRole('button', { name: 'ดึงข้อมูลใหม่' }));
      const dialog = await screen.findByRole('dialog', { name: /ดึงข้อมูลใหม่/ });
      await userEvent.click(within(dialog).getByRole('button', { name: 'ดึงข้อมูลใหม่' }));
      return dialog;
    };

    test('a refusal is shown in the dialog and the project stays', async () => {
      api.fetchTombstones.mockResolvedValue([dropped]);
      api.restoreTombstone.mockRejectedValue(new ApiError('มีรอบดึงข้อมูลกำลังทำงานอยู่', 409));
      render(<Harness />);

      const dialog = await confirmRestore();

      expect(await within(dialog).findByRole('alert')).toHaveTextContent(
        'มีรอบดึงข้อมูลกำลังทำงานอยู่',
      );
      expect(api.fetchTombstones).toHaveBeenCalledTimes(1);
    });

    test('an ended session offers sign-in in the dialog', async () => {
      api.fetchTombstones.mockResolvedValue([dropped]);
      api.restoreTombstone.mockRejectedValue(new SessionEndedError());
      render(<Harness />);

      const dialog = await confirmRestore();

      expect(await within(dialog).findByRole('alert')).toHaveTextContent('เซสชันหมดอายุ');
      expect(within(dialog).getByRole('link', { name: 'เข้าสู่ระบบอีกครั้ง' })).toBeInTheDocument();
    });
  });

  test('a failed read offers a retry', async () => {
    api.fetchTombstones.mockRejectedValue(new ApiError('boom', 500));
    render(<Harness />);

    expect(await screen.findByRole('alert')).toHaveTextContent('boom');
    expect(screen.getByRole('button', { name: 'ลองอีกครั้ง' })).toBeInTheDocument();
  });
});
