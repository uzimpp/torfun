import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import {
  compareBudget,
  type BudgetCandidate,
  type BudgetComparison,
  type BudgetComparisonBasis,
} from '@torfun/types';

import { TorBudgetComparison } from './tor-budget-comparison';

vi.mock('@/lib/api', () => ({ fetchTorBudgetComparison: vi.fn() }));

const api = await import('@/lib/api');
const mocked = vi.mocked(api);

// Fixtures only: invented projects, planned budgets in baht.
const candidate = (i: number, budget: number): BudgetCandidate => ({
  projectId: `p${i}`,
  projectName: `โครงการตัวอย่าง ${i}`,
  deptName: 'หน่วยงาน ก',
  budget,
  budgetYear: i % 2 === 0 ? null : 2568,
  announceDate: '2026-01-01',
});

const group = (
  basis: BudgetComparisonBasis,
  own: number,
  budgets: number[],
  criterion: string | null = 'เกณฑ์ตัวอย่าง',
) => ({
  basis,
  criterion,
  ...(criterion === null
    ? { count: 0, summary: null, projects: [] }
    : compareBudget(
        own,
        budgets.map((budget, i) => candidate(i + 1, budget)),
      )),
});

const comparison = (groups: BudgetComparison['groups'], budget: number | null = 1_000_000) => ({
  minSample: 5,
  budget,
  groups,
});

beforeEach(() => vi.clearAllMocks());

describe('TorBudgetComparison', () => {
  test('names the figure a planned budget, and nowhere a winning or contract price', async () => {
    mocked.fetchTorBudgetComparison.mockResolvedValue(
      comparison([
        group('category', 1_000_000, [900_000, 950_000, 1_100_000, 1_200_000, 1_300_000]),
        group('agency', 1_000_000, []),
        group('tech', 1_000_000, [], null),
      ]),
    );
    render(<TorBudgetComparison projectId="tor" />);

    expect(await screen.findByText('งบประมาณที่ตั้งไว้ของ TOR นี้:')).toBeInTheDocument();
    expect(screen.getAllByText('งบประมาณที่ตั้งไว้').length).toBeGreaterThan(0);
    expect(mocked.fetchTorBudgetComparison).toHaveBeenCalledWith('tor');
    const text = document.body.textContent ?? '';
    // The figure is only ever called a planned budget: no winning, contract or market price.
    expect(text).not.toMatch(/ราคาที่ชนะ|ราคาตามสัญญา|ราคาตลาด|ควรเสนอ/);
  });

  test('shows min, median, max and where the TOR sits once there are five comparables', async () => {
    mocked.fetchTorBudgetComparison.mockResolvedValue(
      comparison([
        group('category', 1_000_000, [800_000, 900_000, 1_100_000, 1_200_000, 1_300_000]),
      ]),
    );
    render(<TorBudgetComparison projectId="tor" />);

    expect(await screen.findByText('งบประมาณที่ตั้งไว้ต่ำสุด')).toBeInTheDocument();
    expect(screen.getByText('800,000 บาท', { selector: 'dd' })).toBeInTheDocument();
    expect(screen.getByText('1,100,000 บาท', { selector: 'dd' })).toBeInTheDocument();
    expect(screen.getByText('1,300,000 บาท', { selector: 'dd' })).toBeInTheDocument();
    expect(screen.getByText('งบของ TOR นี้อยู่ในช่วงของโครงการที่เทียบ')).toBeInTheDocument();
    expect(screen.getByText(/อันดับ 3 จาก 6 \(1 = งบต่ำสุด\)/)).toBeInTheDocument();
  });

  test('shows no summary numbers below five comparables, only the count and the projects', async () => {
    mocked.fetchTorBudgetComparison.mockResolvedValue(
      comparison([group('category', 1_000_000, [900_000, 1_100_000, 1_200_000, 1_300_000])]),
    );
    render(<TorBudgetComparison projectId="tor" />);

    expect(await screen.findByText(/ในโครงการที่ TORfun เก็บไว้ พบ/)).toBeInTheDocument();
    expect(screen.queryByText(/ข้อมูลไม่พอ/)).not.toBeInTheDocument();
    expect(screen.queryByText('งบประมาณที่ตั้งไว้ต่ำสุด')).not.toBeInTheDocument();
    expect(screen.queryByText('มัธยฐาน')).not.toBeInTheDocument();
    expect(screen.queryByText(/อันดับ/)).not.toBeInTheDocument();
    expect(screen.getAllByRole('link')).toHaveLength(4);
  });

  test('says it shows ten of all N when there are more, and lists ten', async () => {
    const budgets = Array.from({ length: 12 }, (_, i) => 100_000 * (i + 1));
    mocked.fetchTorBudgetComparison.mockResolvedValue(
      comparison([group('category', 650_000, budgets)], 650_000),
    );
    render(<TorBudgetComparison projectId="tor" />);

    expect(
      await screen.findByText(
        (_, element) =>
          element?.tagName === 'P' &&
          /แสดง 10 จากทั้งหมด 12 โครงการ/.test(element.textContent ?? ''),
      ),
    ).toBeInTheDocument();
    expect(screen.getAllByRole('link')).toHaveLength(10);
    expect(
      screen.getByText(/สูงกว่า 6 จาก 12 โครงการ · ต่ำกว่า 6 จาก 12 โครงการ/),
    ).toBeInTheDocument();
  });

  test('mentions a tie, and says a missing budget year is unknown', async () => {
    mocked.fetchTorBudgetComparison.mockResolvedValue(
      comparison([
        group('category', 1_000_000, [900_000, 1_000_000, 1_000_000, 1_100_000, 1_200_000]),
      ]),
    );
    render(<TorBudgetComparison projectId="tor" />);

    expect(await screen.findByText(/เท่ากับ 2 โครงการ/)).toBeInTheDocument();
    expect(screen.getAllByText('ไม่ทราบ').length).toBeGreaterThan(0);
    expect(screen.getAllByText('เท่ากัน').length).toBe(2);
  });

  test('lets the officer switch between the three groups, each naming what it matched on', async () => {
    const user = userEvent.setup();
    mocked.fetchTorBudgetComparison.mockResolvedValue(
      comparison([
        group(
          'category',
          1_000_000,
          [800_000, 900_000, 1_100_000, 1_200_000, 1_300_000],
          '4010/03',
        ),
        group('agency', 1_000_000, [950_000], 'หน่วยงาน ก'),
        group('tech', 1_000_000, [], 'React, Node'),
      ]),
    );
    render(<TorBudgetComparison projectId="tor" />);

    const tabs = await screen.findAllByRole('tab');
    expect(tabs.map((tab) => tab.textContent)).toEqual([
      'หมวดเดียวกัน (5)',
      'หน่วยงานเดียวกัน (1)',
      'เทคโนโลยีร่วมกัน (0)',
    ]);
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true');
    expect(within(screen.getByRole('tabpanel')).getByText('4010/03')).toBeInTheDocument();

    await user.click(tabs[1]!);
    expect(tabs[1]).toHaveAttribute('aria-selected', 'true');
    expect(
      within(screen.getByRole('tabpanel')).getByText('หน่วยงาน ก', {
        selector: 'span.text-foreground',
      }),
    ).toBeInTheDocument();
    expect(screen.queryByText('4010/03')).not.toBeInTheDocument();

    await user.click(tabs[2]!);
    expect(within(screen.getByRole('tabpanel')).getByText('React, Node')).toBeInTheDocument();
    expect(
      screen.getByText(
        (_, element) =>
          element?.tagName === 'P' &&
          /ในโครงการที่ TORfun เก็บไว้ พบ 0 โครงการ/.test(element.textContent ?? ''),
      ),
    ).toBeInTheDocument();
  });

  test('says a group cannot be compared when this TOR lacks its data', async () => {
    mocked.fetchTorBudgetComparison.mockResolvedValue(
      comparison([group('category', 1_000_000, [], null)]),
    );
    render(<TorBudgetComparison projectId="tor" />);

    expect(await screen.findByText(/เทียบด้วยเกณฑ์นี้ไม่ได้/)).toBeInTheDocument();
  });

  test('says a TOR without a planned budget cannot be compared', async () => {
    mocked.fetchTorBudgetComparison.mockResolvedValue(comparison([], null));
    render(<TorBudgetComparison projectId="tor" />);

    expect(await screen.findByText('เทียบงบประมาณไม่ได้')).toBeInTheDocument();
  });

  test('a failed load is its own message', async () => {
    mocked.fetchTorBudgetComparison.mockRejectedValue(new Error('boom'));
    render(<TorBudgetComparison projectId="tor" />);

    expect(await screen.findByText('โหลดการเทียบงบประมาณไม่สำเร็จ')).toBeInTheDocument();
  });

  test('says it is loading before the answer', () => {
    mocked.fetchTorBudgetComparison.mockReturnValue(new Promise(() => {}));
    render(<TorBudgetComparison projectId="tor" />);

    expect(screen.getByRole('status')).toHaveTextContent('กำลังโหลดการเทียบงบประมาณ');
  });

  test('never shows the previous project’s comparison while another loads', async () => {
    mocked.fetchTorBudgetComparison.mockImplementation(async (id) =>
      id === 'first'
        ? comparison([group('category', 1_000_000, [900_000], 'หมวดแรก')])
        : new Promise(() => {}),
    );
    const { rerender } = render(<TorBudgetComparison projectId="first" />);
    expect(await screen.findByText('หมวดแรก')).toBeInTheDocument();

    rerender(<TorBudgetComparison projectId="second" />);
    expect(screen.queryByText('หมวดแรก')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toBeInTheDocument();
  });
});

describe('TorBudgetComparison: a short list', () => {
  const names = (long: string) => ({
    ...candidate(1, 900_000),
    projectName: long,
  });

  test('a long project name is shown in full and wraps, and amounts never wrap', async () => {
    const long =
      'โครงการจัดซื้อจัดจ้างระบบสารสนเทศเพื่อการบริหารจัดการข้อมูลกลางของหน่วยงานขนาดใหญ่มาก'.repeat(
        2,
      );
    mocked.fetchTorBudgetComparison.mockResolvedValue(
      comparison([
        {
          basis: 'category' as const,
          criterion: 'เกณฑ์ตัวอย่าง',
          ...compareBudget(1_000_000, [names(long)]),
        },
      ]),
    );
    render(<TorBudgetComparison projectId="tor" />);

    const link = await screen.findByRole('link', { name: long });
    // The whole name is on the page: not cut with an ellipsis, so it may take more than one line.
    expect(link).toHaveTextContent(long);
    expect(link).not.toHaveClass('truncate');
    expect(link).toHaveClass('break-words');
    const row = link.closest('tr')!;
    for (const amount of [
      within(row).getByText('900,000 บาท'),
      within(row).getByText('−100,000 บาท'),
    ]) {
      expect(amount.closest('td')).toHaveClass('whitespace-nowrap');
    }
  });

  test('the explanatory sentences and the table caption are not shown', async () => {
    mocked.fetchTorBudgetComparison.mockResolvedValue(
      comparison([group('category', 1_000_000, [900_000, 1_100_000])]),
    );
    render(<TorBudgetComparison projectId="tor" />);

    await screen.findByText(/ในโครงการที่ TORfun เก็บไว้ พบ/);
    expect(screen.queryByText(/ไม่ปรับตามเงินเฟ้อ/)).not.toBeInTheDocument();
    expect(screen.queryByText(/ใกล้เคียงกับ TOR นี้ที่สุด/)).not.toBeInTheDocument();
    expect(document.querySelector('caption')).toBeNull();
  });
});

describe('TorBudgetComparison: wording and the phone layout', () => {
  test('says the count is of the projects TORfun has stored, never of projects that exist', async () => {
    mocked.fetchTorBudgetComparison.mockResolvedValue(
      comparison([group('category', 1_000_000, [900_000, 1_100_000, 1_200_000])]),
    );
    render(<TorBudgetComparison projectId="tor" />);

    expect(await screen.findByText(/ในโครงการที่ TORfun เก็บไว้ พบ/)).toHaveTextContent(
      'ในโครงการที่ TORfun เก็บไว้ พบ 3 โครงการ',
    );
    expect(screen.queryByText(/พบโครงการที่เทียบได้/)).not.toBeInTheDocument();
  });

  test('on a phone each project is stacked with labelled figures, so nothing scrolls sideways', async () => {
    mocked.fetchTorBudgetComparison.mockResolvedValue(
      comparison([group('category', 1_000_000, [900_000, 1_100_000])]),
    );
    render(<TorBudgetComparison projectId="tor" />);

    const table = (await screen.findAllByRole('table'))[0]!;
    // A block below the `sm` breakpoint and a table from it up.
    expect(table).toHaveClass('block', 'sm:table');
    expect(table.parentElement).not.toHaveClass('overflow-x-auto');
    expect(table.parentElement).toHaveClass('sm:overflow-x-auto');
    const row = within(table).getAllByRole('row')[1]!;
    expect(row).toHaveClass('block', 'sm:table-row');
    const cells = within(row).getAllByRole('cell');
    expect(cells.map((cell) => cell.getAttribute('data-label'))).toEqual([
      null,
      'งบประมาณที่ตั้งไว้',
      'ต่างจาก TOR นี้',
      'ปีงบประมาณ',
    ]);
    // Amounts are never split from "บาท", and the name is not capped on a phone.
    expect(cells[1]).toHaveClass('whitespace-nowrap');
    expect(cells[2]).toHaveClass('whitespace-nowrap');
    const link = within(cells[0]!).getByRole('link');
    expect(link).toHaveClass('max-w-none');
    expect(link.className).not.toContain('max-w-[22rem]');
  });
});
