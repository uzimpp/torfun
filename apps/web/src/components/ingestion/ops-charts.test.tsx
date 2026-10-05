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
    expect(
      within(figure('ข้อผิดพลาดตามขั้นตอน')).getByText('ไม่มีข้อผิดพลาดใน 30 วัน'),
    ).toBeInTheDocument();
  });

  test('the time per record is one compact figure with its split and sample', () => {
    render(
      <OpsCharts
        ops={opsFixture({
          recordTimings: {
            sample: 40,
            p50Ms: 42_000,
            p90Ms: 95_000,
            downloadP50Ms: 8_000,
            analyseP50Ms: 30_000,
          },
        })}
      />,
    );

    const stat = screen.getByRole('group', { name: 'เวลาต่อรายการ (มัธยฐาน 30 วัน)' });
    expect(stat).toHaveTextContent('42 วิ');
    expect(stat).toHaveTextContent('ดาวน์โหลด 8.0 วิ · วิเคราะห์ 30 วิ');
    expect(stat).toHaveTextContent('จาก 40 รายการ');
  });

  test('draws no run-log charts', () => {
    render(<OpsCharts ops={opsFixture()} />);

    expect(screen.getAllByRole('figure')).toHaveLength(3);
    expect(screen.queryByRole('figure', { name: 'โทเคนต่อรอบ' })).not.toBeInTheDocument();
    expect(screen.queryByRole('figure', { name: 'ระยะเวลาต่อรอบ' })).not.toBeInTheDocument();
  });

  test('lists failures by stage in the order the API sends them', () => {
    render(
      <OpsCharts
        ops={opsFixture({
          failuresByStage: [
            { stage: 'extract', count: 1 },
            { stage: 'download', count: 4 },
          ],
        })}
      />,
    );

    expect(figure('ข้อผิดพลาดตามขั้นตอน')).toHaveTextContent('5รวม 30 วัน');
    expect(tableRows('ข้อผิดพลาดตามขั้นตอน').slice(1)).toEqual([
      ['แยกไฟล์ TOR', '1'],
      ['ดาวน์โหลดเอกสาร', '4'],
    ]);
  });
});
