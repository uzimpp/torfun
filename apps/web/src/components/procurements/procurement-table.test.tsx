import { render, screen } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import { EMPTY_MILESTONES, OUTCOME_LABELS, STATUS_LABELS, type Procurement } from '@torfun/types';

import { ProcurementTable } from './procurement-table';

const NOW = new Date('2026-09-30T12:00:00.000Z');
const minutesAgo = (minutes: number) => new Date(NOW.getTime() - minutes * 60_000).toISOString();

function record(overrides: Partial<Procurement> = {}): Procurement {
  return {
    projectId: '67109288963',
    projectName: 'ประกวดราคาจ้างพัฒนาระบบสารสนเทศ',
    deptName: 'กรุงเทพมหานคร',
    deptSubName: null,
    deptCode: '3100001',
    budgetYear: 2568,
    typeId: null,
    goodsId: null,
    detailCheckedAt: '2026-09-01T00:00:00.000Z',
    announceDate: null,
    projectTypeName: null,
    purchaseMethodName: null,
    projectMoney: 16773380,
    priceBuild: null,
    status: 'unknown',
    milestones: EMPTY_MILESTONES,
    timelineCheckedAt: null,
    deadlineAt: null,
    deadlineSource: null,
    state: 'Completed',
    outcome: 'tor_analysed',
    attempts: 0,
    holdReason: null,
    approvedBy: null,
    approvedAt: null,
    statusHistory: [{ state: 'Completed', outcome: 'tor_analysed', at: minutesAgo(10) }],
    zipId: null,
    documents: [],
    analysis: null,
    torAmbiguous: false,
    discoveredAt: minutesAgo(700),
    sourceHash: null,
    updatedAt: minutesAgo(10),
    ...overrides,
  };
}

const renderTable = (items: Procurement[], loading = false) =>
  render(
    <ProcurementTable
      items={items}
      loading={loading}
      selectedId=""
      onOpen={() => {}}
      onAction={() => {}}
    />,
  );

describe('ProcurementTable', () => {
  test('shows each value in Thai, with no English enum name anywhere in the row', () => {
    renderTable([record({ state: 'Queued', outcome: 'error', status: 'contracted' })]);

    const row = screen.getAllByRole('row')[1]!;
    expect(row).toHaveTextContent(OUTCOME_LABELS.error);
    expect(row).toHaveTextContent(STATUS_LABELS.contracted);
    expect(row).not.toHaveTextContent('Queued');
    expect(row).not.toHaveTextContent('contracted');
  });

  test('says a status that has not been read yet', () => {
    renderTable([record({ status: 'unknown' })]);
    expect(screen.getAllByRole('row')[1]).toHaveTextContent(STATUS_LABELS.unknown);
  });

  test('keeps the status cell to the badge and the outcome; progress lives in the drawer', () => {
    renderTable([
      record({
        state: 'Processing',
        outcome: 'analysing',
        attempts: 2,
        statusHistory: [{ state: 'Processing', outcome: 'analysing', at: minutesAgo(12) }],
        updatedAt: minutesAgo(12),
      }),
    ]);

    const status = screen.getAllByRole('cell')[0]!;
    expect(status).toHaveTextContent(OUTCOME_LABELS.analysing);
    expect(status).not.toHaveTextContent(/อยู่ในขั้นนี้|ลองแล้ว/);
  });

  test('while loading, holds the table open with placeholder rows and says it is busy', () => {
    renderTable([], true);
    expect(screen.getByRole('table')).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('status')).toHaveTextContent('กำลังโหลด');
    expect(screen.getAllByRole('row', { hidden: true }).length).toBeGreaterThan(1);
  });
});
