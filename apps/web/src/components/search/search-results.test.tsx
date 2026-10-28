import { render, screen, within } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import type { Procurement } from '@torfun/types';
import { SearchResults } from './search-results';
import { EMPTY_SEARCH_FILTERS } from './search-filter-values';
import { useTorSearch } from './use-tor-search';

vi.mock('./use-tor-search', () => ({
  RESULT_LIMIT: 20,
  useTorSearch: vi.fn(),
}));

const item = {
  projectId: 'project/123',
  projectName: 'พัฒนาระบบจัดการข้อมูล',
  softwareClass: 'new_build',
  eBidding: true,
  status: 'invitation',
  purchaseMethodName: null,
  deptSubName: null,
  deptName: 'สำนักงานพัฒนารัฐบาลดิจิทัล',
  announceDate: '2025-03-06',
  analysis: {
    deadlineAt: '2025-03-20',
    summary: 'สรุปขอบเขตงานสำหรับทดสอบ',
  },
  projectMoney: 3600000,
  year: 2568,
  winner: null,
} as Procurement;

describe('SearchResults cards', () => {
  test('shows procurement badges, linked project details, dates, and budget in a responsive card', () => {
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
        today="2025-03-01"
      />,
    );

    const cardLink = screen.getByRole('link', { name: item.projectName });
    expect(cardLink).toHaveAttribute('href', '/tor/project%2F123');
    expect(screen.getByText('พัฒนาระบบใหม่')).toBeInTheDocument();
    expect(screen.getByText('e-bidding')).toBeInTheDocument();
    expect(screen.getByText('สถานะ: เปิดรับข้อเสนอ')).toBeInTheDocument();
    expect(screen.getByText('สำนักงานพัฒนารัฐบาลดิจิทัล')).toBeInTheDocument();
    expect(screen.getByText('ประกาศ 6 มี.ค. 2568')).toBeInTheDocument();
    expect(screen.getByText('ปิดรับ 20 มี.ค. 2568')).toBeInTheDocument();
    expect(screen.getByText('฿3,600,000')).toBeInTheDocument();
    expect(screen.getByText('ปีงบประมาณ 2568')).toBeInTheDocument();
    expect(screen.getByText('สรุปขอบเขตงานสำหรับทดสอบ')).toBeInTheDocument();
    const sourceLink = screen.getByRole('link', { name: 'ตรวจสอบ TOR ต้นฉบับ' });
    expect(sourceLink).toHaveAttribute(
      'href',
      '/tor/project%2F123',
    );

    const card = cardLink.closest('[data-result-row]');
    expect(card).toHaveClass('group', 'cursor-pointer', 'hover:border-primary/40', 'rounded-2xl', 'border');
    expect(card).not.toHaveClass('shadow-sm', 'shadow-md');
    expect(screen.getByRole('heading', { name: item.projectName })).toHaveClass(
      'text-base',
      'leading-normal',
      'font-semibold',
    );
    expect(sourceLink).toHaveClass('pointer-events-auto', 'z-20');
    const budget = within(card as HTMLElement).getByText('งบประมาณ').parentElement;
    expect(budget).toHaveClass('md:self-start');
    expect(budget).not.toHaveClass('md:border-l');
    expect(within(card as HTMLElement).getByText('งบประมาณ')).toBeInTheDocument();
  });
});
