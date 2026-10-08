import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';

import { ProcurementFilterRow } from './procurement-filter-row';
import { EMPTY_PROCUREMENT_FILTERS as EMPTY_FILTERS } from './procurement-filter-values';

const renderRow = (values = EMPTY_FILTERS, onChange = vi.fn()) => {
  render(
    <ProcurementFilterRow
      values={values}
      onChange={onChange}
      agencies={['กรุงเทพมหานคร']}
      budgetYears={[2568]}
    />,
  );
  return onChange;
};

describe('ProcurementFilterRow', () => {
  test('filters by state, outcome and procurement status, each labelled in Thai', () => {
    renderRow();

    expect(screen.getByLabelText('การประมวลผล')).toBeInTheDocument();
    expect(screen.getByLabelText('ผลการประมวลผล')).toBeInTheDocument();
    expect(screen.getByLabelText('สถานะโครงการ')).toBeInTheDocument();
  });

  test('offers the shared Thai labels as options, not enum names', () => {
    renderRow();

    const outcome = screen.getByLabelText('ผลการประมวลผล');
    expect(within(outcome).getByRole('option', { name: 'กำลังประมวลผล' })).toBeInTheDocument();
    expect(within(outcome).getByRole('option', { name: 'รอผู้ดูแลตรวจสอบ' })).toBeInTheDocument();
    const state = screen.getByLabelText('การประมวลผล');
    expect(within(state).getByRole('option', { name: 'รอคิว' })).toBeInTheDocument();
    expect(within(state).queryByRole('option', { name: 'Queued' })).not.toBeInTheDocument();
    const status = screen.getByLabelText('สถานะโครงการ');
    expect(within(status).getByRole('option', { name: 'ร่าง / เตรียมการ' })).toBeInTheDocument();
    expect(within(status).getByRole('option', { name: 'ยังไม่ทราบสถานะ' })).toBeInTheDocument();
  });

  test('choosing an outcome reports just that change', () => {
    const onChange = renderRow();
    fireEvent.change(screen.getByLabelText('ผลการประมวลผล'), { target: { value: 'analysing' } });
    expect(onChange).toHaveBeenCalledWith({ outcome: 'analysing' });
  });

  test('offers to clear the filters only when some are set', () => {
    renderRow();
    expect(screen.queryByRole('button', { name: 'ล้างทั้งหมด' })).not.toBeInTheDocument();
  });

  test('the search words show as a chip that removes them and empties the box', () => {
    const onChange = renderRow({ ...EMPTY_FILTERS, q: 'ระบบ' });
    const chips = screen.getByRole('list', { name: 'ตัวกรองที่ใช้อยู่' });

    fireEvent.click(within(chips).getByRole('button', { name: 'ล้างตัวกรอง ค้นหา: ระบบ' }));

    expect(onChange).toHaveBeenCalledWith({ q: '' });
    expect(screen.getByLabelText('ค้นหาชื่อโครงการหรือรหัส')).toHaveValue('');
  });

  test('clearing resets every filter at once', () => {
    const onChange = renderRow({ ...EMPTY_FILTERS, outcome: 'analysing', status: 'drafting' });
    fireEvent.click(screen.getByRole('button', { name: 'ล้างทั้งหมด' }));
    expect(onChange).toHaveBeenCalledWith(EMPTY_FILTERS);
  });
});
