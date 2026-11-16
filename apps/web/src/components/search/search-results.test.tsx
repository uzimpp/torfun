import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import { EMPTY_TIMELINE, type Procurement } from '@torfun/types';
import { SearchResults } from './search-results';
import { EMPTY_SEARCH_FILTERS } from './search-filter-values';
import { useTorSearch } from './use-tor-search';

vi.mock('./use-tor-search', () => ({
  RESULT_LIMIT: 20,
  useTorSearch: vi.fn(),
}));

const item: Procurement = {
  projectId: 'project/123',
  projectName: 'พัฒนาระบบจัดการข้อมูล',
  deptName: 'สำนักงานพัฒนารัฐบาลดิจิทัล',
  deptSubName: null,
  deptCode: '1234567890',
  announceDate: '2025-03-06',
  purchaseMethodName: 'ประกวดราคาอิเล็กทรอนิกส์ (e-bidding)',
  discoveredAt: '2025-03-06T00:00:00.000Z',
  budgetYear: 2568,
  typeId: null,
  goodsId: null,
  projectMoney: 3_600_000,
  priceBuild: null,
  detailReadAt: '2025-03-06T00:00:00.000Z',
  timeline: { ...EMPTY_TIMELINE, status: 'open' },
  state: 'Completed',
  outcome: 'tor_analysed',
  attempts: 0,
  holdReason: null,
  statusHistory: [],
  approved: null,
  archive: { zipId: 'zip-1', documents: [], torAmbiguous: false },
  analysis: {
    summary: 'สรุปขอบเขตงานสำหรับทดสอบ',
    scopeOfWork: [],
    budgetThb: null,
    deadlineAt: '2025-03-20',
    durationDays: null,
    techStack: [],
    targetPlatforms: [],
    requiredQualifications: [],
  },
  updatedAt: '2025-03-06T00:00:00.000Z',
};

describe('SearchResults cards', () => {
  test('includes the active sort and page in the TOR detail return URL', () => {
    vi.mocked(useTorSearch).mockReturnValue({
      items: [item],
      total: 25,
      loading: false,
      block: null,
      detail: null,
    });

    render(
      <SearchResults
        filters={{ ...EMPTY_SEARCH_FILTERS, order: 'budgetDesc' }}
        page={2}
        onPageChange={vi.fn()}
        onOrderChange={vi.fn()}
      />,
    );

    expect(screen.getByRole('link', { name: item.projectName })).toHaveAttribute(
      'href',
      '/tor/project%2F123?returnTo=%2Fsearch%3Forder%3DbudgetDesc%26page%3D2',
    );
  });

  test('shows procurement details, source links, dates, and budget in a responsive card', () => {
    const onOrderChange = vi.fn();
    vi.mocked(useTorSearch).mockReturnValue({
      items: [item],
      total: 1,
      loading: false,
      block: null,
      detail: null,
    });

    render(
      <SearchResults
        filters={EMPTY_SEARCH_FILTERS}
        page={1}
        onPageChange={vi.fn()}
        onOrderChange={onOrderChange}
      />,
    );

    const order = screen.getByRole('combobox', { name: 'เรียงตาม' });
    expect(order).toHaveValue('announced');
    expect(
      within(order)
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual([
      'ประกาศล่าสุด',
      'ใกล้ปิดรับข้อเสนอมากสุด',
      'งบประมาณจากมากไปน้อย',
      'งบประมาณจากน้อยไปมาก',
    ]);
    fireEvent.change(order, { target: { value: 'budgetAsc' } });
    expect(onOrderChange).toHaveBeenCalledWith('budgetAsc');

    const cardLink = screen.getByRole('link', { name: item.projectName });
    expect(cardLink).toHaveAttribute('href', '/tor/project%2F123?returnTo=%2Fsearch');
    expect(screen.getByText('e-bidding')).toBeInTheDocument();
    expect(screen.queryByText('ประกวดราคาอิเล็กทรอนิกส์ (e-bidding)')).not.toBeInTheDocument();
    expect(screen.getByText('สถานะ: เปิดรับข้อเสนอ')).toBeInTheDocument();
    expect(screen.getByText('สำนักงานพัฒนารัฐบาลดิจิทัล')).toBeInTheDocument();
    expect(screen.getByText('ปิดรับ 20 มี.ค. 2568')).toBeInTheDocument();
    expect(screen.getByText('ประกาศ 6 มี.ค. 2568')).toBeInTheDocument();
    expect(screen.queryByText('วันที่ประกาศ')).not.toBeInTheDocument();
    expect(screen.getByText('฿3,600,000')).toBeInTheDocument();
    expect(screen.getAllByText('ปีงบประมาณ 2568')).toHaveLength(1);
    expect(screen.queryByText('เตรียมตัวก่อนเปิดรับข้อเสนอ')).not.toBeInTheDocument();
    expect(screen.getByText('สรุปขอบเขตงานสำหรับทดสอบ')).toBeInTheDocument();
    const sourceLink = screen.getByRole('link', { name: 'ตรวจสอบ TOR ต้นฉบับ' });
    expect(sourceLink).toHaveAttribute('href', '/tor/project%2F123?returnTo=%2Fsearch');

    const card = cardLink.closest('[data-result-row]');
    expect(card).toHaveClass(
      'group',
      'cursor-pointer',
      'hover:border-primary/40',
      'rounded-2xl',
      'border',
    );
    expect(card).not.toHaveClass('shadow-sm', 'shadow-md');
    expect(screen.getByRole('heading', { name: item.projectName })).toHaveClass(
      'text-base',
      'leading-normal',
      'font-semibold',
    );
    expect(sourceLink).toHaveClass('pointer-events-auto', 'z-20');
    expect(
      within(card as HTMLElement).getByText('งบประมาณ').parentElement?.parentElement,
    ).toHaveClass('md:self-start', 'md:justify-self-end');
  });
});
