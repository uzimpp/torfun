import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import { fetchFiscalYears } from '@/lib/api';
import { ProcurementFilters } from './procurement-filters';
import {
  activeFilterCount,
  EMPTY_SEARCH_FILTERS,
  hasSearchCriteria,
  parseSearchFilters,
  searchHref,
  toProjectFilters,
  withoutSearchFilter,
} from './search-filter-values';

vi.mock('@/lib/api', () => ({ fetchFiscalYears: vi.fn() }));

function currentThaiFiscalYear(): number {
  return (
    Number(
      new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Bangkok',
        year: 'numeric',
      }).format(new Date()),
    ) + 543
  );
}

beforeEach(() => {
  vi.mocked(fetchFiscalYears).mockResolvedValue({
    years: [currentThaiFiscalYear(), currentThaiFiscalYear() - 1, 2560],
  });
});

describe('ProcurementFilters', () => {
  test('renders filter controls and retains the search page layout behavior', async () => {
    const user = userEvent.setup();
    render(<ProcurementFilters values={EMPTY_SEARCH_FILTERS} />);

    const clearButton = screen.getByRole('button', { name: 'ล้างทั้งหมด' });
    expect(clearButton).toBeDisabled();
    expect(clearButton).toHaveClass('disabled:cursor-not-allowed');
    expect(screen.queryByRole('button', { name: 'ใช้ตัวกรอง' })).not.toBeInTheDocument();
    const toggle = screen.getByRole('button', { name: /^ตัวกรอง/ });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await user.click(toggle);

    expect(screen.getByRole('group', { name: 'ขั้นตอนจัดซื้อจัดจ้าง' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'ทุกขั้นตอน' })).not.toBeChecked();
    expect(screen.getByLabelText('ขั้นต่ำ')).toHaveAttribute('name', 'minBudget');
    expect(screen.getByLabelText('สูงสุด')).toHaveAttribute('name', 'maxBudget');
    expect(screen.getByLabelText('ปีงบประมาณ (พ.ศ.)')).toHaveValue('all');
    expect(screen.getByLabelText('กำหนดส่งถึง')).toHaveAttribute('type', 'date');
    expect(screen.getByLabelText('ประกาศตั้งแต่')).toHaveAttribute('type', 'date');
    expect(screen.getByLabelText('เว็บแอปพลิเคชัน')).toHaveAttribute('name', 'targetPlatforms');
    expect(screen.getByLabelText('คำค้นในชื่อโครงการ')).toHaveAttribute('name', 'industry');
    expect(screen.queryByLabelText('สถานที่ดำเนินงาน')).not.toBeInTheDocument();
  });

  test('clears selected filters from the heading and preserves the search words', async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    render(
      <ProcurementFilters
        values={{ ...EMPTY_SEARCH_FILTERS, query: 'ระบบ', status: ['drafting'] }}
        onApply={onApply}
      />,
    );

    const clearButton = screen.getByRole('button', { name: 'ล้างทั้งหมด' });
    expect(screen.getByRole('heading', { name: 'ตัวกรองประกาศ' })).toHaveClass('whitespace-nowrap');
    expect(clearButton).toHaveClass('justify-self-end', '-mr-2');
    expect(clearButton.parentElement).toHaveClass('grid-cols-[minmax(0,1fr)_auto]');
    expect(screen.getByLabelText('ตัวกรองที่ใช้งาน')).toHaveClass('py-4');
    expect(screen.getByLabelText('ตัวกรองที่ใช้งาน').nextElementSibling).toHaveClass('pt-0');
    expect(clearButton).toBeEnabled();
    expect(clearButton).toHaveClass('cursor-pointer');
    await user.click(clearButton);

    expect(onApply).toHaveBeenCalledWith({ ...EMPTY_SEARCH_FILTERS, query: 'ระบบ' });
  });

  test('allows selecting multiple valid procurement statuses', async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    render(<ProcurementFilters values={EMPTY_SEARCH_FILTERS} onApply={onApply} />);

    await user.click(screen.getByRole('checkbox', { name: 'ร่าง / เตรียมการ' }));
    await user.click(screen.getByRole('checkbox', { name: 'อยู่ระหว่างพิจารณา' }));

    expect(onApply).toHaveBeenCalledWith(
      expect.objectContaining({ status: ['drafting', 'evaluating'] }),
    );
  });

  test('applies text filters as they are entered without a submit button', async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    render(<ProcurementFilters values={EMPTY_SEARCH_FILTERS} onApply={onApply} />);

    await user.click(screen.getByRole('button', { name: /^ตัวกรอง/ }));
    await user.type(screen.getByLabelText('คำค้นในชื่อโครงการ'), 'โรงพยาบาล');

    await waitFor(() =>
      expect(onApply).toHaveBeenLastCalledWith(
        expect.objectContaining({ industry: 'โรงพยาบาล' }),
      ),
    );
  });

  test('selects and clears all valid statuses', async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    render(<ProcurementFilters values={EMPTY_SEARCH_FILTERS} onApply={onApply} />);

    await user.click(screen.getByRole('checkbox', { name: 'ทุกขั้นตอน' }));
    expect(screen.getByRole('checkbox', { name: 'ร่าง / เตรียมการ' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'ยังไม่ทราบสถานะ' })).toBeChecked();
    expect(onApply).toHaveBeenCalledWith(
      expect.objectContaining({ status: expect.arrayContaining(['drafting', 'open']) }),
    );
    await user.click(screen.getByRole('checkbox', { name: 'ทุกขั้นตอน' }));
    expect(screen.getByRole('checkbox', { name: 'ร่าง / เตรียมการ' })).not.toBeChecked();
  });

  test('selects multiple budget years and submits them under the API field name', async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    render(<ProcurementFilters values={EMPTY_SEARCH_FILTERS} onApply={onApply} />);

    await user.selectOptions(screen.getByLabelText('ปีงบประมาณ (พ.ศ.)'), 'select');
    const latestYear = String(currentThaiFiscalYear());
    const previousYear = String(currentThaiFiscalYear() - 1);
    await user.click(await screen.findByLabelText(`ปีงบประมาณ ${latestYear}`));
    await user.click(screen.getByLabelText(`ปีงบประมาณ ${previousYear}`));

    expect(onApply).toHaveBeenCalledWith(
      expect.objectContaining({ budgetYear: [latestYear, previousYear] }),
    );
  });

  test('keeps minimum-days-left semantics and excludes conflicting date ranges', async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    render(
      <ProcurementFilters
        values={{
          ...EMPTY_SEARCH_FILTERS,
          deadlineFrom: '2026-10-01',
          deadlineTo: '2026-10-31',
        }}
        onApply={onApply}
      />,
    );

    await user.selectOptions(screen.getByLabelText('เวลาที่เหลือก่อนปิดรับ'), '14');
    expect(screen.getByLabelText('กำหนดส่งตั้งแต่')).toBeDisabled();

    expect(onApply).toHaveBeenCalledWith(
      expect.objectContaining({
        status: ['open'],
        minDaysLeft: '14',
        deadlineFrom: '',
        deadlineTo: '',
      }),
    );
  });

  test('clears minimum-days-left when a non-open status is selected', async () => {
    const user = userEvent.setup();
    render(<ProcurementFilters values={EMPTY_SEARCH_FILTERS} />);

    await user.selectOptions(screen.getByLabelText('เวลาที่เหลือก่อนปิดรับ'), 'custom');
    await user.type(screen.getByLabelText('จำนวนวันขั้นต่ำ'), '2');
    expect(screen.getByRole('checkbox', { name: 'เปิดรับข้อเสนอ' })).toBeChecked();
    await user.click(screen.getByRole('checkbox', { name: 'ร่าง / เตรียมการ' }));
    expect(screen.getByLabelText('จำนวนวันขั้นต่ำ')).toHaveValue(null);
    expect(screen.getByLabelText('กำหนดส่งตั้งแต่')).not.toBeDisabled();
  });

  test('date and budget fields submit the selected values', () => {
    const onApply = vi.fn();
    render(
      <ProcurementFilters
        values={{ ...EMPTY_SEARCH_FILTERS, publishedFrom: '2026-10-01', publishedTo: '2026-10-10' }}
        onApply={onApply}
      />,
    );
    fireEvent.change(screen.getByLabelText('ประกาศตั้งแต่'), { target: { value: '2026-10-02' } });
    fireEvent.change(screen.getByLabelText('กำหนดส่งตั้งแต่'), { target: { value: '2026-10-05' } });
    fireEvent.change(screen.getByLabelText('กำหนดส่งถึง'), { target: { value: '2026-10-15' } });
    fireEvent.change(screen.getByLabelText('ขั้นต่ำ'), { target: { value: '1000' } });

    expect(onApply).toHaveBeenCalledWith(
      expect.objectContaining({
        publishedFrom: '2026-10-02',
        publishedTo: '2026-10-10',
        deadlineFrom: '2026-10-05',
        deadlineTo: '2026-10-15',
        minBudget: '1000',
      }),
    );
  });
});

describe('search-filter-values', () => {
  test('parses, serializes and sends multi-select values using current API fields', () => {
    const values = parseSearchFilters({
      q: 'ระบบ',
      order: 'budgetAsc',
      status: ['drafting', 'evaluating'],
      budgetYear: ['2569', '2568'],
      minDaysLeft: '3',
      targetPlatforms: 'web_app,mobile',
    });

    expect(
      parseSearchFilters(
        Object.fromEntries(new URLSearchParams(searchHref(values, 2).split('?')[1])),
      ),
    ).toEqual(values);
    expect(toProjectFilters(values, 20, 20)).toMatchObject({
      q: 'ระบบ',
      status: ['drafting', 'evaluating'],
      budgetYear: [2569, 2568],
      order: 'budgetAsc',
      minDaysLeft: 3,
      targetPlatforms: ['web_app', 'mobile'],
      limit: 20,
      offset: 20,
    });
    expect(searchHref(values)).toContain('budgetYear=2569%2C2568');
    expect(searchHref(values)).toContain('order=budgetAsc');
    expect(searchHref(values)).not.toContain('deadlineDays');
  });

  test('counts and clears multi-select criteria without losing other filters', () => {
    const values = parseSearchFilters({
      q: 'ระบบ',
      status: ['drafting', 'open'],
      budgetYear: ['2569', '2568'],
    });

    expect(activeFilterCount(values)).toBe(2);
    expect(hasSearchCriteria(values)).toBe(true);
    expect(withoutSearchFilter(values, 'status')).toEqual({ ...values, status: [] });
    expect(withoutSearchFilter(values, 'budgetYear')).toEqual({ ...values, budgetYear: [] });
    expect(parseSearchFilters({ status: ['invalid', 'drafting'] }).status).toEqual(['drafting']);
    expect(parseSearchFilters({ order: 'invalid' }).order).toBe('announced');
    expect(toProjectFilters(EMPTY_SEARCH_FILTERS, 20, 0)).not.toHaveProperty('status');
    expect(toProjectFilters(EMPTY_SEARCH_FILTERS, 20, 0)).toMatchObject({ order: 'announced' });
  });
});
