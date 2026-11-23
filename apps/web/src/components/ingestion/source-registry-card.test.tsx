import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { SourceRegistryView } from '@torfun/types';
import { SourceRegistrySettings } from './source-registry-card';

vi.mock('@/lib/api-sources', () => ({
  fetchSources: vi.fn(),
  addSource: vi.fn(),
  editSource: vi.fn(),
  removeSource: vi.fn(),
}));

const api = await import('@/lib/api-sources');
const mocked = vi.mocked(api);

const view: SourceRegistryView = {
  items: [{ deptId: '0305', deptName: 'กรมศุลกากร' }],
  available: [{ deptId: '0307', deptName: 'กรมสรรพากร' }],
  isDefault: false,
  updatedAt: null,
  updatedBy: null,
};

beforeEach(() => vi.clearAllMocks());

describe('SourceRegistrySettings', () => {
  test('lists the registry and the agencies that can be added back', async () => {
    mocked.fetchSources.mockResolvedValue(view);
    render(<SourceRegistrySettings />);

    expect(await screen.findByText('กรมศุลกากร')).toBeTruthy();
    expect(screen.getByRole('button', { name: /กรมสรรพากร \(0307\)/ })).toBeTruthy();
  });

  test('adding an available agency sends it and shows the answer', async () => {
    mocked.fetchSources.mockResolvedValue(view);
    mocked.addSource.mockResolvedValue({
      ...view,
      items: [...view.items, { deptId: '0307', deptName: 'กรมสรรพากร' }],
      available: [],
    });
    render(<SourceRegistrySettings />);

    await userEvent.click(await screen.findByRole('button', { name: /กรมสรรพากร \(0307\)/ }));

    await waitFor(() =>
      expect(mocked.addSource).toHaveBeenCalledWith({ deptId: '0307', deptName: 'กรมสรรพากร' }),
    );
    expect(await screen.findByText('รหัสหน่วยงาน 0307')).toBeTruthy();
  });

  test('a malformed id is refused in the form, before any request', async () => {
    mocked.fetchSources.mockResolvedValue(view);
    render(<SourceRegistrySettings />);
    await screen.findByText('กรมศุลกากร');

    await userEvent.type(screen.getByLabelText('รหัสหน่วยงาน e-GP'), 'abc');
    await userEvent.type(screen.getByLabelText('ชื่อหน่วยงาน'), 'ทดสอบ');
    await userEvent.click(screen.getByRole('button', { name: 'เพิ่มหน่วยงาน' }));

    expect((await screen.findByRole('alert')).textContent).toContain('4 to 7 digits');
    expect(mocked.addSource).not.toHaveBeenCalled();
  });

  test('removal asks for confirmation first', async () => {
    mocked.fetchSources.mockResolvedValue(view);
    mocked.removeSource.mockResolvedValue({ ...view, items: [], available: [] });
    render(<SourceRegistrySettings />);

    await userEvent.click(await screen.findByRole('button', { name: 'ลบ กรมศุลกากร' }));
    expect(mocked.removeSource).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'ยืนยันการลบ' }));

    await waitFor(() => expect(mocked.removeSource).toHaveBeenCalledWith('0305'));
  });
});
