import { render, screen, within } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import type { IngestionOps } from '@torfun/types';

import { OpsCharts } from './ops-charts';

const NOW = new Date('2026-10-03T05:00:00.000Z');

const ops = (overrides: Partial<IngestionOps> = {}): IngestionOps => ({
  recordTimings: { sample: 0, p50Ms: null, p90Ms: null, downloadP50Ms: null, analyseP50Ms: null },
  throughputDaily: [],
  failuresByStage: [],
  live: {
    runInProgress: false,
    runStartedAt: null,
    elapsedMs: null,
    stopRequested: false,
    inFlight: null,
    queueRemaining: null,
    memory: null,
  },
  runs: [],
  ...overrides,
});

const dailyFigure = () => screen.getByRole('figure', { name: /ต่อวัน \(30 วัน\)/ });

describe('OpsCharts', () => {
  test('counts records held for review apart from the ones that failed', () => {
    render(
      <OpsCharts
        ops={ops({ throughputDaily: [{ date: '2026-10-03', completed: 5, held: 2, failed: 1 }] })}
        now={NOW}
      />,
    );

    const figure = dailyFigure();
    const legend = within(figure).getByRole('list');
    expect(
      within(legend)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual(['เสร็จสิ้น', 'รอตรวจสอบ', 'ล้มเหลว']);

    const table = within(figure).getByRole('table');
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((cell) => cell.textContent),
    ).toEqual(['ช่วง', 'เสร็จสิ้น', 'รอตรวจสอบ', 'ล้มเหลว']);
    const today = within(table).getAllByRole('row')[1]!;
    expect(
      within(today)
        .getAllByRole('cell')
        .slice(1)
        .map((cell) => cell.textContent),
    ).toEqual(['5', '2', '1']);
  });

  test('lists failures by stage in the order the API sends them', () => {
    render(
      <OpsCharts
        ops={ops({
          failuresByStage: [
            { stage: 'extract', count: 1 },
            { stage: 'download', count: 4 },
          ],
        })}
        now={NOW}
      />,
    );

    const figure = screen.getByRole('figure', { name: /ข้อผิดพลาดตามขั้นตอน/ });
    expect(
      within(figure)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual(['แยกไฟล์ TOR1', 'ดาวน์โหลดเอกสาร4']);
  });
});
