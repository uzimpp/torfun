import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import type { CurrentUser } from '@/lib/auth';

/**
 * One route, two audiences. A Site Administrator lands on the operations
 * overview; a Business Development Officer keeps the welcome page they had. The
 * gate stays `requireCompany`, which already exempts administrators.
 */
vi.mock('@/lib/auth', () => ({ requireCompany: vi.fn() }));
vi.mock('@/components/admin-dashboard/admin-dashboard', () => ({
  AdminDashboard: () => <div data-testid="admin-dashboard" />,
}));

const { requireCompany } = await import('@/lib/auth');
const { default: DashboardPage } = await import('./page');

const user = (overrides: Partial<CurrentUser>): CurrentUser =>
  ({
    id: 'u1',
    username: 'tester',
    full_name: 'ผู้ทดสอบ ระบบ',
    role: 'business_development_officer',
    company_id: 'c1',
    company_name: 'บริษัท ตัวอย่าง จำกัด',
    ...overrides,
  }) as CurrentUser;

beforeEach(() => vi.clearAllMocks());

describe('/dashboard', () => {
  test('a Site Administrator gets the operations overview', async () => {
    vi.mocked(requireCompany).mockResolvedValue(user({ role: 'admin', company_id: null }));

    render(await DashboardPage());

    expect(screen.getByTestId('admin-dashboard')).toBeInTheDocument();
  });

  test('a Business Development Officer keeps the welcome page, with no administrator content', async () => {
    vi.mocked(requireCompany).mockResolvedValue(user({}));

    render(await DashboardPage());

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'ยินดีต้อนรับ, ผู้ทดสอบ ระบบ',
    );
    expect(screen.getByText('บริษัท ตัวอย่าง จำกัด')).toBeInTheDocument();
    expect(screen.queryByTestId('admin-dashboard')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /ติดตามการดึงข้อมูล TOR/ })).not.toBeInTheDocument();
  });
});
