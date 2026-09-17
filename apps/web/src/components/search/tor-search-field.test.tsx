import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, test, vi } from 'vitest';

import { TorSearchField } from './tor-search-field';

const navigation = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: navigation.push }),
}));

beforeEach(() => vi.clearAllMocks());

test('updates the existing search box when URL state changes without duplicating it', async () => {
  const user = userEvent.setup();
  const { rerender } = render(<TorSearchField size="hero" defaultValue="" />);

  const searchbox = screen.getByRole('searchbox', { name: 'ค้นหาประกาศ TOR' });
  await user.type(searchbox, 'ระบบโรงพยาบาล');
  await user.click(screen.getByRole('button', { name: 'ค้นหา' }));

  expect(navigation.push).toHaveBeenCalledWith(
    '/search?q=%E0%B8%A3%E0%B8%B0%E0%B8%9A%E0%B8%9A%E0%B9%82%E0%B8%A3%E0%B8%87%E0%B8%9E%E0%B8%A2%E0%B8%B2%E0%B8%9A%E0%B8%B2%E0%B8%A5',
  );

  // App Router navigation updates the Server Component prop while preserving
  // this client boundary. It must update that one field, not require a keyed
  // remount (which caused the duplicate captured in the bug report).
  rerender(<TorSearchField size="hero" defaultValue="ระบบโรงพยาบาล" />);
  expect(screen.getAllByRole('searchbox', { name: 'ค้นหาประกาศ TOR' })).toHaveLength(1);
  expect(searchbox).toHaveValue('ระบบโรงพยาบาล');

  rerender(<TorSearchField size="hero" defaultValue="พัฒนาเว็บไซต์" />);
  expect(screen.getAllByRole('searchbox', { name: 'ค้นหาประกาศ TOR' })).toHaveLength(1);
  expect(searchbox).toHaveValue('พัฒนาเว็บไซต์');
});
