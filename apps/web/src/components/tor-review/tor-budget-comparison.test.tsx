import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { BudgetComparison } from '@torfun/types';
import { TorBudgetComparison } from './tor-budget-comparison';

vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  fetchBudgetComparison: vi.fn(),
}));

const api = await import('@/lib/api');
const mocked = vi.mocked(api);

const comparison: BudgetComparison = {
  projectId: 'target',
  budget: 9_000_000,
  peerCount: 4,
  min: 1_000_000,
  p25: 1_750_000,
  median: 3_000_000,
  p75: 4_250_000,
  max: 5_000_000,
  percentile: 100,
  peers: [
    {
      projectId: 'peer-1',
      projectName: 'ระบบทะเบียน',
      deptName: 'กรมตัวอย่าง',
      budget: 2_000_000,
      shared: ['react', 'web_app'],
    },
  ],
};

beforeEach(() => vi.clearAllMocks());

describe('TorBudgetComparison', () => {
  test('places the budget against similar TORs and links each peer', async () => {
    mocked.fetchBudgetComparison.mockResolvedValue(comparison);
    render(<TorBudgetComparison projectId="target" />);
    expect(
      await screen.findByText('งบประมาณสูงกว่าโครงการที่คล้ายกันส่วนใหญ่'),
    ).toBeInTheDocument();
    expect(screen.getByText('สูงกว่า 100% ของโครงการที่คล้ายกัน')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /ระบบทะเบียน/ })).toHaveAttribute(
      'href',
      '/tor/peer-1',
    );
    expect(screen.getByText(/ใช้ร่วมกัน: react, web_app/)).toBeInTheDocument();
  });

  test('says so when nothing similar has a budget', async () => {
    mocked.fetchBudgetComparison.mockResolvedValue({ ...comparison, peerCount: 0, peers: [] });
    render(<TorBudgetComparison projectId="target" />);
    expect(
      await screen.findByText('ยังไม่มีโครงการที่คล้ายกันพร้อมงบประมาณให้เทียบ'),
    ).toBeInTheDocument();
  });

  test('a network failure is not reported as a broken API', async () => {
    mocked.fetchBudgetComparison.mockRejectedValue(new api.ApiError('offline', 0));
    render(<TorBudgetComparison projectId="target" />);
    expect(await screen.findByRole('alert')).toHaveTextContent('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้');
  });
});
