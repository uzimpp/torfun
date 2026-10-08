import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';

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

describe('ProcurementFilters', () => {
  test('renders the supported controls as one GET form', async () => {
    const user = userEvent.setup();
    render(<ProcurementFilters values={EMPTY_SEARCH_FILTERS} />);
    await user.click(screen.getByRole('button', { name: /^ตัวกรอง/ }));

    const form = screen.getByRole('button', { name: 'ใช้ตัวกรอง' }).closest('form');
    expect(form).toHaveAttribute('action', '/search');
    expect(form).toHaveAttribute('method', 'get');
    expect(screen.getByRole('slider', { name: 'งบประมาณต่ำสุด (บาท)' })).toBeInTheDocument();
    expect(screen.getAllByRole('slider')).toHaveLength(2);
    expect(screen.getByLabelText('กำหนดส่งถึง')).toHaveAttribute('type', 'date');
    expect(screen.getByLabelText('ประกาศตั้งแต่')).toHaveAttribute('type', 'date');
    expect(screen.getByLabelText('เว็บแอปพลิเคชัน')).toHaveAttribute('name', 'targetPlatforms');
    expect(screen.getByLabelText('คำค้นในชื่อโครงการ / ชื่อหน่วยงาน')).toHaveAttribute(
      'name',
      'industry',
    );
    expect(screen.queryByLabelText('สถานที่ดำเนินงาน')).not.toBeInTheDocument();
    expect(screen.getByText(/TOR ที่วิเคราะห์สำเร็จแล้วเท่านั้น/)).toBeInTheDocument();
    expect(screen.getByText(/ไม่ใช่หมวดอุตสาหกรรมที่ยืนยันแล้ว/)).toBeInTheDocument();
  });

  test('collapses mobile controls while keeping the desktop sidebar available', async () => {
    const user = userEvent.setup();
    render(<ProcurementFilters values={EMPTY_SEARCH_FILTERS} />);
    const toggle = screen.getByRole('button', { name: /^ตัวกรอง/ });
    const fields = document.getElementById('procurement-filter-fields');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(fields).toHaveClass('hidden', 'lg:block');
    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(fields).not.toHaveClass('hidden');
    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
  });

  test('chooses a days-left preset and applies the method without conflicting date bounds', async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    render(
      <ProcurementFilters
        values={{
          ...EMPTY_SEARCH_FILTERS,
          query: 'ระบบ',
          deadlineFrom: '2026-10-01',
          deadlineTo: '2026-10-31',
        }}

        onApply={onApply}
      />,
    );
    await user.selectOptions(screen.getByLabelText('วิธีจัดซื้อจัดจ้าง'), 'true');
    await user.click(screen.getByRole('button', { name: '14 วันขึ้นไป' }));
    expect(screen.getByLabelText('กำหนดส่งตั้งแต่')).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'ใช้ตัวกรอง' }));
    expect(onApply).toHaveBeenCalledWith(
      expect.objectContaining({
        query: 'ระบบ',
        status: 'open',
        eBidding: 'true',
        minDaysLeft: '14',
        deadlineFrom: '',
        deadlineTo: '',
      }),
    );
  });

  test('supports a custom count and clears it when switching to drafting', async () => {
    const user = userEvent.setup();
    render(<ProcurementFilters values={EMPTY_SEARCH_FILTERS} />);
    await user.click(screen.getByRole('button', { name: /^ตัวกรอง/ }));
    await user.type(screen.getByLabelText('เหลืออย่างน้อยกี่วัน (0 = ปิดรับวันนี้ก็ได้)'), '2');
    expect(screen.getByLabelText('ขั้นตอนจัดซื้อจัดจ้าง')).toHaveValue('open');
    await user.selectOptions(screen.getByLabelText('ขั้นตอนจัดซื้อจัดจ้าง'), 'drafting');
    expect(screen.getByLabelText('เหลืออย่างน้อยกี่วัน (0 = ปิดรับวันนี้ก็ได้)')).toHaveValue(null);
    expect(screen.getByLabelText('กำหนดส่งตั้งแต่')).not.toBeDisabled();
  });

  test('date fields submit the selected announcement and closing bounds', async () => {
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
    expect(screen.getByLabelText('ประกาศถึง')).toHaveAttribute('min', '2026-10-02');
    expect(screen.getByLabelText('กำหนดส่งตั้งแต่')).toHaveAttribute('max', '2026-10-15');
    fireEvent.submit(screen.getByRole('button', { name: 'ใช้ตัวกรอง' }).closest('form')!);
    expect(onApply).toHaveBeenCalledWith(
      expect.objectContaining({
        publishedFrom: '2026-10-02',
        publishedTo: '2026-10-10',
        deadlineFrom: '2026-10-05',
        deadlineTo: '2026-10-15',
      }),
    );
  });

  test('one budget slider submits both bounds and supports keyboard adjustments', async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    render(
      <ProcurementFilters
        values={{ ...EMPTY_SEARCH_FILTERS, minBudget: '500000', maxBudget: '5000000' }}
        onApply={onApply}
      />,
    );
    const minimum = screen.getByRole('slider', { name: 'งบประมาณต่ำสุด (บาท)' });
    minimum.focus();
    await user.keyboard('{ArrowRight}');
    expect(minimum).toHaveAttribute('aria-valuetext', '501,000 บาท');
    const maximum = screen.getByRole('slider', { name: 'งบประมาณสูงสุด (บาท)' });
    maximum.focus();
    await user.keyboard('{ArrowLeft}');
    fireEvent.submit(screen.getByRole('button', { name: 'ใช้ตัวกรอง' }).closest('form')!);
    expect(onApply).toHaveBeenCalledWith(
      expect.objectContaining({ minBudget: '501000', maxBudget: '4999000' }),
    );
  });

  test('adjusting the minimum leaves an unspecified maximum uncapped', async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    render(<ProcurementFilters values={EMPTY_SEARCH_FILTERS} onApply={onApply} />);
    screen.getByRole('slider', { name: 'งบประมาณต่ำสุด (บาท)' }).focus();
    await user.keyboard('{ArrowRight}');
    fireEvent.submit(screen.getByRole('button', { name: 'ใช้ตัวกรอง' }).closest('form')!);
    expect(onApply).toHaveBeenCalledWith(
      expect.objectContaining({ minBudget: '1000', maxBudget: '' }),
    );
  });

  test('preserves a bookmarked budget above the normal slider scale and clears its upper cap at the end', async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    render(
      <ProcurementFilters
        values={{ ...EMPTY_SEARCH_FILTERS, minBudget: '120000000', maxBudget: '180000000' }}
        onApply={onApply}
      />,
    );
    fireEvent.submit(screen.getByRole('button', { name: 'ใช้ตัวกรอง' }).closest('form')!);
    expect(onApply).toHaveBeenLastCalledWith(
      expect.objectContaining({ minBudget: '120000000', maxBudget: '180000000' }),
    );
    screen.getByRole('slider', { name: 'งบประมาณสูงสุด (บาท)' }).focus();
    await user.keyboard('{End}');
    fireEvent.submit(screen.getByRole('button', { name: 'ใช้ตัวกรอง' }).closest('form')!);
    expect(onApply).toHaveBeenLastCalledWith(
      expect.objectContaining({ minBudget: '120000000', maxBudget: '' }),
    );
  });

  test('clears an active criterion through the live search callback without losing other criteria', async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    const values = {
      ...EMPTY_SEARCH_FILTERS,
      query: 'ระบบ',
      eBidding: 'true' as const,
      year: '2569',
    };
    render(<ProcurementFilters values={values} onApply={onApply} />);
    await user.click(screen.getByRole('link', { name: 'ล้างตัวกรอง เฉพาะ e-bidding' }));
    expect(onApply).toHaveBeenLastCalledWith({ ...values, eBidding: '' });
    await user.click(screen.getByRole('link', { name: 'ล้างทั้งหมด' }));
    expect(onApply).toHaveBeenLastCalledWith({ ...EMPTY_SEARCH_FILTERS, query: 'ระบบ' });
  });

  test('shows active state and clears filters without losing the search words', () => {
    const values = {
      ...EMPTY_SEARCH_FILTERS,
      query: 'ระบบโรงพยาบาล',
      minBudget: '500000',
      techStack: 'React, PostgreSQL',
      targetPlatforms: ['web_app' as const],
    };
    render(<ProcurementFilters values={values} />);

    expect(screen.getAllByText('3')).toHaveLength(2);
    expect(screen.getByRole('link', { name: 'ล้างทั้งหมด' })).toHaveAttribute(
      'href',
      '/search?q=%E0%B8%A3%E0%B8%B0%E0%B8%9A%E0%B8%9A%E0%B9%82%E0%B8%A3%E0%B8%87%E0%B8%9E%E0%B8%A2%E0%B8%B2%E0%B8%9A%E0%B8%B2%E0%B8%A5',
    );
    const clearBudget = screen.getByRole('link', { name: /ล้างตัวกรอง งบประมาณ/ });
    expect(clearBudget).not.toHaveAttribute('href', expect.stringContaining('minBudget'));
    expect(clearBudget).toHaveAttribute('href', expect.stringContaining('techStack='));
    expect(screen.getByLabelText('เว็บแอปพลิเคชัน')).toBeChecked();
  });
});

describe('procurement status filter', () => {
  test('is read from the URL only when it names one of the known stages', () => {
    expect(parseSearchFilters({ status: 'drafting' }).status).toBe('drafting');
    expect(parseSearchFilters({ status: 'unknown' }).status).toBe('unknown');
    // A stage that no longer exists, a Thai label, or nothing: no filter.
    expect(parseSearchFilters({ status: 'invitation' }).status).toBe('');
    expect(parseSearchFilters({ status: 'ร่าง / เตรียมการ' }).status).toBe('');
    expect(parseSearchFilters({}).status).toBe('');
  });

  test('becomes part of the server request and the shareable URL, and only when set', () => {
    const values = { ...EMPTY_SEARCH_FILTERS, status: 'drafting' as const };

    expect(toProjectFilters(values, 20, 0)).toMatchObject({ status: 'drafting' });
    expect(searchHref(values)).toBe('/search?status=drafting');
    expect(toProjectFilters(EMPTY_SEARCH_FILTERS, 20, 0)).not.toHaveProperty('status');
    expect(searchHref(EMPTY_SEARCH_FILTERS)).toBe('/search');
  });

  test('counts as an active filter and can be cleared on its own', () => {
    const values = { ...EMPTY_SEARCH_FILTERS, query: 'ระบบ', status: 'open' as const };

    expect(activeFilterCount(values)).toBe(1);
    expect(hasSearchCriteria({ ...EMPTY_SEARCH_FILTERS, status: 'open' })).toBe(true);
    expect(withoutSearchFilter(values, 'status')).toEqual({ ...values, status: '' });
  });

  test('is offered in Thai only, as a select named status, with the current choice kept', () => {
    // An active filter opens the panel by itself, so there is no toggle to click.
    render(<ProcurementFilters values={{ ...EMPTY_SEARCH_FILTERS, status: 'drafting' }} />);

    const select = screen.getByLabelText('ขั้นตอนจัดซื้อจัดจ้าง');
    expect(select).toHaveAttribute('name', 'status');
    expect(select).toHaveValue('drafting');

    const labels = within(select)
      .getAllByRole('option')
      .map((option) => option.textContent);
    expect(labels).toEqual([
      'ทุกขั้นตอน',
      'ร่าง / เตรียมการ',
      'เปิดรับข้อเสนอ',
      'อยู่ระหว่างพิจารณา',
      'ประกาศผู้ชนะแล้ว',
      'ทำสัญญาแล้ว',
      'ยกเลิก',
      'ยังไม่ทราบสถานะ',
    ]);
    // No English enum name leaks into what an officer reads.
    for (const label of labels) expect(label).not.toMatch(/[A-Za-z]/);
  });

  test('shows the chosen stage as a removable chip', () => {
    render(<ProcurementFilters values={{ ...EMPTY_SEARCH_FILTERS, status: 'drafting' }} />);

    expect(screen.getByRole('link', { name: 'ล้างตัวกรอง ร่าง / เตรียมการ' })).toHaveAttribute(
      'href',
      '/search',
    );
  });
});

test('URL filters become the exact server-side request and remain shareable', () => {
  const values = parseSearchFilters({
    q: 'ระบบ',
    minBudget: '500000',
    deadlineTo: '2026-10-15',
    techStack: 'React, PostgreSQL',
    targetPlatforms: 'web_app,mobile',
    industry: 'โรงพยาบาล',
    location: 'คลองเตย',
  });

  expect(toProjectFilters(values, 20, 20)).toEqual({
    q: 'ระบบ',
    minBudget: 500000,
    deadlineTo: '2026-10-15',
    techStack: ['React', 'PostgreSQL'],
    targetPlatforms: ['web_app', 'mobile'],
    industry: 'โรงพยาบาล',
    limit: 20,
    offset: 20,
  });
  expect(searchHref(values, 2)).toContain('page=2');
  expect(searchHref(values, 2)).toContain('targetPlatforms=web_app%2Cmobile');
  expect(searchHref(values, 2)).not.toContain('location=');
});

test('new criteria remain intact through URLs, pagination, and individual clear links', () => {
  const values = parseSearchFilters({
    q: 'ระบบ',
    status: 'drafting',
    eBidding: 'true',
    year: '2569',
    deptName: 'กรมทดสอบ',
    outcome: 'tor_analysed',
  });
  expect(
    parseSearchFilters(
      Object.fromEntries(new URLSearchParams(searchHref(values, 3).split('?')[1])),
    ),
  ).toEqual(values);
  expect(toProjectFilters(values, 20, 40)).toMatchObject({
    status: 'drafting',
    eBidding: true,
    year: 2569,
    deptName: 'กรมทดสอบ',
    outcome: 'tor_analysed',
    offset: 40,
  });
  const deadline = parseSearchFilters({ minDaysLeft: '0' });
  expect(toProjectFilters(deadline, 20, 0)).toMatchObject({ minDaysLeft: 0 });
});
