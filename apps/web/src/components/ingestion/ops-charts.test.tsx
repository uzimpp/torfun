import { render, screen, within } from '@testing-library/react';
import { describe, expect, test } from 'vitest';

import { OpsCharts } from './ops-charts';
import { dailyWindow, opsFixture, ZERO_DISCOVERED, ZERO_THROUGHPUT } from './ops-fixture';

const figure = (name: string | RegExp) => screen.getByRole('figure', { name });

const tableRows = (name: string) =>
  within(within(figure(name)).getByRole('table'))
    .getAllByRole('row')
    .map((row) =>
      within(row)
        .getAllByRole(row.querySelector('th') ? 'columnheader' : 'cell')
        .map((cell) => cell.textContent),
    );

describe('OpsCharts', () => {
  test('found per day reads the whole window as a table, newest first, with its total', () => {
    render(
      <OpsCharts
        ops={opsFixture({
          discoveredDaily: dailyWindow(ZERO_DISCOVERED, {
            '2026-09-20': { discovered: 12 },
            '2026-10-05': { discovered: 3 },
          }),
        })}
      />,
    );

    const found = figure('ประกาศที่พบต่อวัน (30 วัน)');
    expect(found).toHaveTextContent('15รวม 30 วัน');
    const rows = tableRows('ประกาศที่พบต่อวัน (30 วัน)');
    expect(rows).toHaveLength(31);
    expect(rows[0]).toEqual(['วันที่', 'ประกาศที่พบ']);
    expect(rows[1]).toEqual(['5 ต.ค.', '3']);
    expect(rows.at(-1)).toEqual(['6 ก.ย.', '0']);
  });

  test('counts records held for review apart from the ones that failed', () => {
    render(
      <OpsCharts
        ops={opsFixture({
          throughputDaily: dailyWindow(ZERO_THROUGHPUT, {
            '2026-10-05': { completed: 5, held: 2, failed: 1 },
          }),
        })}
      />,
    );

    const rows = tableRows('ผลการประมวลผลต่อวัน');
    expect(rows[0]).toEqual(['วันที่', 'เสร็จสิ้น', 'รอตรวจสอบ', 'ล้มเหลว']);
    expect(rows[1]).toEqual(['5 ต.ค.', '5', '2', '1']);
  });

  test('a quiet window keeps its card and says so, with no table of zeros', () => {
    render(<OpsCharts ops={opsFixture()} />);

    const found = figure('ประกาศที่พบต่อวัน (30 วัน)');
    expect(within(found).getByText('ไม่พบประกาศใหม่ใน 30 วัน')).toBeInTheDocument();
    expect(within(found).queryByRole('table')).not.toBeInTheDocument();
    expect(
      within(figure('ผลการประมวลผลต่อวัน')).getByText('ไม่มีรายการที่ประมวลผลจบใน 30 วัน'),
    ).toBeInTheDocument();
  });

  test('draws the two daily charts only: no failures-by-stage, no time per record, no run-log charts', () => {
    render(<OpsCharts ops={opsFixture()} />);

    expect(screen.getAllByRole('figure')).toHaveLength(2);
    expect(screen.queryByRole('figure', { name: 'ข้อผิดพลาดตามขั้นตอน' })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('group', { name: 'เวลาต่อรายการ (มัธยฐาน 30 วัน)' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('figure', { name: 'โทเคนต่อรอบ' })).not.toBeInTheDocument();
    expect(screen.queryByRole('figure', { name: 'ระยะเวลาต่อรอบ' })).not.toBeInTheDocument();
  });
});
