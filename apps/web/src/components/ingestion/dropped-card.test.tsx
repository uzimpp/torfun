import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { TOMBSTONE_REASON_LABELS, type Tombstone } from '@torfun/types';

import { ApiError, SessionEndedError } from '@/lib/api';
import { DroppedCard } from './dropped-card';

/**
 * What an administrator sees of the projects the model dropped: why each went,
 * the passage that decided it, and a way to have it read afresh. The API does
 * not exist as far as these tests are concerned.
 */
vi.mock('@/lib/api-tombstones', () => ({
  fetchTombstones: vi.fn(),
  restoreTombstone: vi.fn(),
  removeTombstone: vi.fn(),
}));

const api = await import('@/lib/api-tombstones');
const mocked = vi.mocked(api);

const dropped: Tombstone = {
  projectId: '66059313551',
  reason: 'ai_not_software',
  evidence: 'จัดซื้อเครื่องคอมพิวเตอร์ 50 เครื่อง',
  promptVersion: '2026-10-01.1',
  decidedAt: '2026-10-02T00:00:00.000Z',
  decidedBy: null,
};

beforeEach(() => vi.resetAllMocks());

const renderCard = (onChanged = vi.fn()) => {
  render(<DroppedCard reloadKey={0} onChanged={onChanged} />);
  return { onChanged };
};

describe('DroppedCard', () => {
  test('says plainly when nothing has been dropped', async () => {
    mocked.fetchTombstones.mockResolvedValue([]);
    renderCard();

    expect(await screen.findByText('ยังไม่มีโครงการที่ถูกคัดออก')).toBeInTheDocument();
  });

  test('shows each project with why it was dropped and the passage that decided it', async () => {
    mocked.fetchTombstones.mockResolvedValue([dropped]);
    renderCard();

    const row = await screen.findByRole('listitem');
    expect(within(row).getByText(TOMBSTONE_REASON_LABELS.ai_not_software)).toBeInTheDocument();
    expect(within(row).getByText(/จัดซื้อเครื่องคอมพิวเตอร์ 50 เครื่อง/)).toBeInTheDocument();
    expect(within(row).getByText('66059313551')).toBeInTheDocument();
  });

  test('says which administrator decided, when a person did', async () => {
    mocked.fetchTombstones.mockResolvedValue([
      { ...dropped, reason: 'admin_deleted', promptVersion: null, decidedBy: 'somchai' },
    ]);
    renderCard();

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
      mocked.fetchTombstones.mockResolvedValueOnce([dropped]).mockResolvedValueOnce([]);
      mocked.removeTombstone.mockResolvedValue(undefined);
      const { onChanged } = renderCard();

      const dialog = await open();
      expect(dialog).toHaveTextContent(/รอบดึงข้อมูลถัดไปอาจนำโครงการนี้กลับมา/);
      expect(mocked.removeTombstone).not.toHaveBeenCalled();
      await userEvent.click(within(dialog).getByRole('button', { name: 'ลบออกจากรายการ' }));

      expect(mocked.removeTombstone).toHaveBeenCalledWith('66059313551');
      expect(await screen.findByText('ยังไม่มีโครงการที่ถูกคัดออก')).toBeInTheDocument();
      expect(mocked.restoreTombstone).not.toHaveBeenCalled();
      expect(onChanged).toHaveBeenCalled();
    });

    test('Escape leaves everything as it was', async () => {
      mocked.fetchTombstones.mockResolvedValue([dropped]);
      renderCard();
      await open();

      await userEvent.keyboard('{Escape}');

      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      expect(mocked.removeTombstone).not.toHaveBeenCalled();
      expect(screen.getByRole('listitem')).toBeInTheDocument();
    });
  });

  describe('restoring', () => {
    const open = async () => {
      await userEvent.click(await screen.findByRole('button', { name: 'ดึงข้อมูลใหม่' }));
      return screen.findByRole('dialog', { name: /ดึงข้อมูลใหม่/ });
    };

    test('warns that it downloads from the upstream site, then queues one read and says so', async () => {
      mocked.fetchTombstones.mockResolvedValueOnce([dropped]).mockResolvedValueOnce([]);
      mocked.restoreTombstone.mockResolvedValue(undefined);
      const { onChanged } = renderCard();

      const dialog = await open();
      expect(dialog).toHaveTextContent(/ดาวน์โหลด.*เว็บไซต์ต้นทาง/);
      expect(mocked.restoreTombstone).not.toHaveBeenCalled();
      await userEvent.click(within(dialog).getByRole('button', { name: 'ดึงข้อมูลใหม่' }));

      expect(mocked.restoreTombstone).toHaveBeenCalledWith('66059313551');
      expect(await screen.findByText('ยังไม่มีโครงการที่ถูกคัดออก')).toBeInTheDocument();
      expect(screen.getByRole('status')).toHaveTextContent(/จัดคิวอ่านใหม่/);
      expect(onChanged).toHaveBeenCalled();
    });

    test('a refusal is shown in the dialog and the project stays', async () => {
      mocked.fetchTombstones.mockResolvedValue([dropped]);
      mocked.restoreTombstone.mockRejectedValue(new ApiError('มีรอบดึงข้อมูลกำลังทำงานอยู่', 409));
      const { onChanged } = renderCard();

      const dialog = await open();
      await userEvent.click(within(dialog).getByRole('button', { name: 'ดึงข้อมูลใหม่' }));

      expect(await within(dialog).findByRole('alert')).toHaveTextContent(
        'มีรอบดึงข้อมูลกำลังทำงานอยู่',
      );
      expect(onChanged).not.toHaveBeenCalled();
    });

    test('an ended session offers sign-in in the dialog', async () => {
      mocked.fetchTombstones.mockResolvedValue([dropped]);
      mocked.restoreTombstone.mockRejectedValue(new SessionEndedError());
      renderCard();

      const dialog = await open();
      await userEvent.click(within(dialog).getByRole('button', { name: 'ดึงข้อมูลใหม่' }));

      expect(await within(dialog).findByRole('alert')).toHaveTextContent('เซสชันหมดอายุ');
      expect(within(dialog).getByRole('link', { name: 'เข้าสู่ระบบอีกครั้ง' })).toBeInTheDocument();
    });
  });

  test('reads the list again when the console says something changed elsewhere', async () => {
    mocked.fetchTombstones.mockResolvedValueOnce([]).mockResolvedValueOnce([dropped]);
    const { rerender } = render(<DroppedCard reloadKey={0} onChanged={() => {}} />);
    await screen.findByText('ยังไม่มีโครงการที่ถูกคัดออก');

    rerender(<DroppedCard reloadKey={1} onChanged={() => {}} />);

    expect(await screen.findByRole('listitem')).toBeInTheDocument();
  });

  test('a failure to load is announced, with a way to try again', async () => {
    mocked.fetchTombstones.mockRejectedValueOnce(new ApiError('Cannot reach the API', 0));
    mocked.fetchTombstones.mockResolvedValueOnce([]);
    renderCard();

    expect(await screen.findByRole('alert')).toHaveTextContent('ไม่สามารถโหลด');
    await userEvent.click(screen.getByRole('button', { name: 'ลองอีกครั้ง' }));
    await waitFor(() =>
      expect(screen.getByText('ยังไม่มีโครงการที่ถูกคัดออก')).toBeInTheDocument(),
    );
  });
});
