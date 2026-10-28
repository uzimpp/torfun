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
    expect(screen.queryByRole('link', { name: 'ล้างทั้งหมด' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'ล้างตัวกรอง' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^ตัวกรอง/ }));

    const form = screen.getByRole('button', { name: 'ใช้ตัวกรอง' }).closest('form');
    expect(form).toHaveAttribute('action', '/search');
    expect(form).toHaveAttribute('method', 'get');
    expect(screen.getByLabelText('ขั้นตอนจัดซื้อจัดจ้าง')).toHaveValue('');
    expect(screen.getByRole('option', { name: 'ทุกขั้นตอน' })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'หมายเหตุเกี่ยวกับช่วงวันที่ปิดรับข้อเสนอ' }),
    ).toHaveAttribute('aria-describedby', 'deadlineFrom-hint');
    expect(document.getElementById('deadlineFrom-hint')).toHaveTextContent(
      'กำหนดส่งค้นจาก TOR ที่วิเคราะห์สำเร็จแล้วเท่านั้น โปรดตรวจสอบวันปิดรับจากต้นฉบับ',
    );
    expect(
      screen.getByRole('button', { name: 'หมายเหตุเกี่ยวกับเวลาที่เหลือก่อนปิดรับ' }),
    ).toHaveAttribute('aria-describedby', 'deadline-days-hint');
    expect(screen.getAllByRole('tooltip')).toHaveLength(4);
    expect(document.getElementById('deadline-days-hint')).toHaveTextContent(
      'เฉพาะประกาศเชิญชวนที่ยังไม่มีผู้ชนะ อ้างอิงวันในประเทศไทย',
    );
    expect(
      screen.queryByText('เลือกจัดทำ TOR เพื่อเตรียมตัวก่อนประกาศเชิญชวน'),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText('ขั้นต่ำ')).toHaveAttribute('name', 'minBudget');
    expect(screen.getByLabelText('สูงสุด')).toHaveAttribute('name', 'maxBudget');
    expect(screen.getByLabelText('ปีงบประมาณ (พ.ศ.)')).toHaveValue('all');
    expect(screen.queryByLabelText('ค้นหาปีงบประมาณ')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'หมายเหตุเกี่ยวกับงบประมาณ' })).toHaveAttribute(
      'aria-describedby',
      'budget-hint',
    );
    expect(document.getElementById('budget-hint')).toHaveTextContent(
      'เว้นช่องสูงสุดว่างไว้ - ไม่จำกัดงบประมาณสูงสุด',
    );
    expect(screen.getAllByRole('tooltip')).toHaveLength(4);
    expect(screen.getByLabelText('กำหนดส่งถึง')).toHaveAttribute('type', 'date');
    expect(screen.getByLabelText('ประกาศตั้งแต่')).toHaveAttribute('type', 'date');
    expect(screen.getByLabelText('เว็บแอปพลิเคชัน')).toHaveAttribute('name', 'targetPlatforms');
    expect(screen.getByLabelText('คำค้นในชื่อโครงการ')).toHaveAttribute(
      'name',
      'industry',
    );
    expect(screen.getByRole('button', { name: 'หมายเหตุเกี่ยวกับคำค้นในชื่อโครงการ' })).toHaveAttribute(
      'aria-describedby',
      'industry-hint',
    );
    expect(document.getElementById('industry-hint')).toHaveTextContent(
      'คำค้นไม่ใช่หมวดอุตสาหกรรมที่ยืนยันแล้ว',
    );
    expect(screen.queryByLabelText('สถานที่ดำเนินงาน')).not.toBeInTheDocument();
    expect(screen.getByText(/TOR ที่วิเคราะห์สำเร็จแล้วเท่านั้น/)).toBeInTheDocument();
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

<<<<<<< HEAD
  test('chooses a days-left preset and applies the method without conflicting date bounds', async () => {
=======
  test('searches and selects one fiscal year from the checkbox list', async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    render(<ProcurementFilters values={EMPTY_SEARCH_FILTERS} onApply={onApply} />);

    const currentYear =
      Number(
        new Intl.DateTimeFormat('en-US', {
          timeZone: 'Asia/Bangkok',
          year: 'numeric',
        }).format(new Date()),
      ) + 543;
    const latestYear = String(currentYear);
    const previousYear = String(currentYear - 1);
    await user.selectOptions(screen.getByLabelText('ปีงบประมาณ (พ.ศ.)'), 'select');
    expect(screen.getByLabelText(`ปีงบประมาณ ${latestYear}`)).toBeInTheDocument();
    expect(screen.getByLabelText(`ปีงบประมาณ ${previousYear}`)).toBeInTheDocument();
    await user.type(screen.getByLabelText('ค้นหาปีงบประมาณ'), previousYear);
    expect(screen.queryByLabelText(`ปีงบประมาณ ${latestYear}`)).not.toBeInTheDocument();
    await user.click(screen.getByLabelText(`ปีงบประมาณ ${previousYear}`));
    expect(screen.getByLabelText(`ปีงบประมาณ ${previousYear}`)).toBeChecked();
    await user.clear(screen.getByLabelText('ค้นหาปีงบประมาณ'));
    await user.click(screen.getByLabelText(`ปีงบประมาณ ${latestYear}`));
    expect(screen.getByLabelText(`ปีงบประมาณ ${latestYear}`)).toBeChecked();
    expect(screen.getByLabelText(`ปีงบประมาณ ${previousYear}`)).not.toBeChecked();
    await user.click(screen.getByRole('button', { name: 'ใช้ตัวกรอง' }));

    expect(onApply).toHaveBeenCalledWith(expect.objectContaining({ year: latestYear }));
  });

  test('selects suggested and custom technologies and applies them as comma-separated terms', async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    render(<ProcurementFilters values={EMPTY_SEARCH_FILTERS} onApply={onApply} />);

    await user.click(screen.getByRole('button', { name: 'เพิ่มเทคโนโลยี React' }));
    await user.type(screen.getByRole('searchbox', { name: 'ค้นหาเทคโนโลยี' }), 'Python');
    await user.click(screen.getByRole('button', { name: 'เพิ่มเทคโนโลยี Python' }));
    await user.type(screen.getByRole('searchbox', { name: 'ค้นหาเทคโนโลยี' }), 'Rust');
    await user.keyboard('{Enter}');

    expect(screen.getByRole('button', { name: 'ลบเทคโนโลยี React' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'ลบเทคโนโลยี Python' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'ลบเทคโนโลยี Rust' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'ใช้ตัวกรอง' }));

    expect(onApply).toHaveBeenCalledWith(
      expect.objectContaining({ techStack: 'React, Python, Rust' }),
    );
  });

  test('updates fiscal year options at the Thai calendar year boundary', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2028-01-01T00:00:00+07:00'));
    try {
      render(<ProcurementFilters values={EMPTY_SEARCH_FILTERS} />);
      fireEvent.change(screen.getByLabelText('ปีงบประมาณ (พ.ศ.)'), { target: { value: 'select' } });

      expect(screen.getByLabelText('ปีงบประมาณ 2571')).toBeInTheDocument();
      expect(screen.getByLabelText('ปีงบประมาณ 2568')).toBeInTheDocument();
      expect(screen.queryByLabelText('ปีงบประมาณ 2567')).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  test('chooses exact deadline days and applies the method without conflicting date bounds', async () => {
>>>>>>> 13cfc3a (polish uxui of search and filter page)
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
<<<<<<< HEAD
    await user.click(screen.getByRole('button', { name: '14 วันขึ้นไป' }));
=======
    await user.selectOptions(screen.getByLabelText('เวลาที่เหลือก่อนปิดรับ'), '3');
    expect(screen.getByLabelText('จำนวนวัน')).toBeDisabled();
    expect(screen.getByLabelText('จำนวนวัน')).toHaveValue(3);
>>>>>>> 13cfc3a (polish uxui of search and filter page)
    expect(screen.getByLabelText('กำหนดส่งตั้งแต่')).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'ใช้ตัวกรอง' }));
    expect(onApply).toHaveBeenCalledWith(
      expect.objectContaining({
        query: 'ระบบ',
        status: 'open',
        eBidding: 'true',
<<<<<<< HEAD
        minDaysLeft: '14',
=======
        deadlineDays: '3',
        deadlineMode: 'within',
>>>>>>> 13cfc3a (polish uxui of search and filter page)
        deadlineFrom: '',
        deadlineTo: '',
      }),
    );
  });

  test('supports a custom deadline and clears it when switching to drafting', async () => {
    const user = userEvent.setup();
    render(<ProcurementFilters values={EMPTY_SEARCH_FILTERS} />);
    await user.click(screen.getByRole('button', { name: /^ตัวกรอง/ }));
<<<<<<< HEAD
    await user.type(screen.getByLabelText('เหลืออย่างน้อยกี่วัน (0 = ปิดรับวันนี้ก็ได้)'), '2');
    expect(screen.getByLabelText('ขั้นตอนจัดซื้อจัดจ้าง')).toHaveValue('open');
    await user.selectOptions(screen.getByLabelText('ขั้นตอนจัดซื้อจัดจ้าง'), 'drafting');
    expect(screen.getByLabelText('เหลืออย่างน้อยกี่วัน (0 = ปิดรับวันนี้ก็ได้)')).toHaveValue(null);
=======
    expect(screen.getByLabelText('จำนวนวัน')).toBeDisabled();
    await user.selectOptions(screen.getByLabelText('เวลาที่เหลือก่อนปิดรับ'), 'custom');
    expect(screen.getByLabelText('จำนวนวัน')).toBeEnabled();
    await user.type(screen.getByLabelText('จำนวนวัน'), '2');
    expect(screen.getByLabelText('ขั้นตอนจัดซื้อจัดจ้าง')).toHaveValue('invitation');
    await user.selectOptions(screen.getByLabelText('ขั้นตอนจัดซื้อจัดจ้าง'), 'drafting_tor');
    expect(screen.getByLabelText('ขั้นตอนจัดซื้อจัดจ้าง')).toHaveValue('drafting_tor');
    expect(screen.getByLabelText('เวลาที่เหลือก่อนปิดรับ')).toHaveValue('');
    expect(screen.getByLabelText('จำนวนวัน')).toBeDisabled();
>>>>>>> 13cfc3a (polish uxui of search and filter page)
    expect(screen.getByLabelText('กำหนดส่งตั้งแต่')).not.toBeDisabled();
  });

  test('shows the number field only for a custom deadline and submits its value', async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    render(<ProcurementFilters values={EMPTY_SEARCH_FILTERS} onApply={onApply} />);

    expect(screen.getByLabelText('จำนวนวัน')).toBeDisabled();
    await user.selectOptions(screen.getByLabelText('เวลาที่เหลือก่อนปิดรับ'), 'custom');
    await user.type(screen.getByLabelText('จำนวนวัน'), '12');
    await user.click(screen.getByRole('button', { name: 'ใช้ตัวกรอง' }));

    expect(onApply).toHaveBeenCalledWith(expect.objectContaining({ deadlineDays: '12' }));
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

  test('budget minimum and maximum inputs submit both bounds', async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    render(
      <ProcurementFilters
        values={{ ...EMPTY_SEARCH_FILTERS, minBudget: '500000', maxBudget: '5000000' }}
        onApply={onApply}
      />,
    );
    await user.clear(screen.getByLabelText('ขั้นต่ำ'));
    await user.type(screen.getByLabelText('ขั้นต่ำ'), '501000');
    await user.clear(screen.getByLabelText('สูงสุด'));
    await user.type(screen.getByLabelText('สูงสุด'), '4999000');
    fireEvent.submit(screen.getByRole('button', { name: 'ใช้ตัวกรอง' }).closest('form')!);
    expect(onApply).toHaveBeenCalledWith(
      expect.objectContaining({ minBudget: '501000', maxBudget: '4999000' }),
    );
  });

  test('budget minimum works with an unspecified maximum', async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    render(<ProcurementFilters values={EMPTY_SEARCH_FILTERS} onApply={onApply} />);
    await user.type(screen.getByLabelText('ขั้นต่ำ'), '1000');
    fireEvent.submit(screen.getByRole('button', { name: 'ใช้ตัวกรอง' }).closest('form')!);
    expect(onApply).toHaveBeenCalledWith(
      expect.objectContaining({ minBudget: '1000', maxBudget: '' }),
    );
  });

  test('preserves bookmarked budget bounds above the former slider scale', () => {
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
  });

  test('clears an active criterion through its chip without losing other criteria', async () => {
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
  });

  test('clears selected filters immediately while keeping the search query', async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    const values = {
      ...EMPTY_SEARCH_FILTERS,
      query: 'ระบบ',
      status: 'invitation' as const,
      eBidding: 'true' as const,
      publishedFrom: '2026-10-01',
      minBudget: '500000',
      techStack: 'React',
      targetPlatforms: ['web_app' as const],
      outcome: 'tor_analysed' as const,
      year: '2569',
      industry: 'โรงพยาบาล',
      deadlineDays: '3',
    };
    render(<ProcurementFilters values={values} onApply={onApply} />);

    await user.click(screen.getByRole('button', { name: 'ล้างตัวกรอง' }));

    expect(onApply).toHaveBeenCalledWith({ ...EMPTY_SEARCH_FILTERS, query: 'ระบบ' });
    expect(screen.getByLabelText('ขั้นตอนจัดซื้อจัดจ้าง')).toHaveValue('');
    expect(screen.getByLabelText('วิธีจัดซื้อจัดจ้าง')).toHaveValue('');
    expect(screen.getByLabelText('กำหนดส่งตั้งแต่')).toHaveValue('');
    expect(screen.getByLabelText('ประกาศตั้งแต่')).toHaveValue('');
    expect(screen.getByLabelText('เว็บแอปพลิเคชัน')).not.toBeChecked();
    expect(screen.getByLabelText('มีสรุป TOR แล้ว')).not.toBeChecked();
    expect(screen.getByLabelText('ปีงบประมาณ (พ.ศ.)')).toHaveValue('all');
    expect(screen.queryByLabelText('ค้นหาปีงบประมาณ')).not.toBeInTheDocument();
    expect(screen.getByLabelText('ขั้นต่ำ')).toHaveValue(null);
    expect(screen.getByLabelText('สูงสุด')).toHaveValue(null);
    expect(screen.getByLabelText('จำนวนวัน')).toBeDisabled();
    expect(screen.getByLabelText('เวลาที่เหลือก่อนปิดรับ')).toHaveValue('');
    expect(screen.getByLabelText('กำหนดส่งตั้งแต่')).not.toBeDisabled();
    expect(screen.queryByRole('button', { name: 'ลบเทคโนโลยี React' })).not.toBeInTheDocument();
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
