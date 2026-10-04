import { render, screen, within } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import { EMPTY_MILESTONES, type Procurement } from '@torfun/types';

import { ProcurementDrawer } from './procurement-drawer';

const NOW = new Date('2026-09-30T12:00:00.000Z');
const minutesAgo = (minutes: number) => new Date(NOW.getTime() - minutes * 60_000).toISOString();

function record(overrides: Partial<Procurement> = {}): Procurement {
  return {
    projectId: '67109288963',
    projectName: 'ประกวดราคาจ้างพัฒนาระบบสารสนเทศ',
    deptName: 'กรุงเทพมหานคร',
    deptSubName: null,
    province: null,
    district: null,
    subdistrict: null,
    deptCode: '3100001',
    budgetYear: 2568,
    announceDate: null,
    projectTypeName: null,
    purchaseMethodName: null,
    projectMoney: 16773380,
    priceBuild: null,
    status: 'open',
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
    winner: null,
    torAmbiguous: false,
    discoveredAt: minutesAgo(700),
    sourceHash: null,
    updatedAt: minutesAgo(10),
    ...overrides,
  };
}

const inFlight = (minutes: number, attempts = 0) =>
  record({
    state: 'Processing',
    outcome: 'analysing',
    attempts,
    statusHistory: [{ state: 'Processing', outcome: 'analysing', at: minutesAgo(minutes) }],
    updatedAt: minutesAgo(minutes),
  });

const renderDrawer = (props: Partial<Parameters<typeof ProcurementDrawer>[0]> = {}) =>
  render(
    <ProcurementDrawer
      open
      record={record()}
      error={null}
      now={NOW}
      onRetry={vi.fn()}
      onClose={vi.fn()}
      onActionDone={vi.fn()}
      {...props}
    />,
  );

const statusGroup = () => screen.getByRole('group', { name: 'สถานะการประมวลผล' });

describe('ProcurementDrawer status', () => {
  test('says how long a Processing record has been in its stage', () => {
    renderDrawer({ record: inFlight(3) });
    const line = within(statusGroup()).getByText('อยู่ในขั้นนี้ 3 นาที');
    expect(line.querySelector('svg')).toBeNull();
  });

  test('marks it with an icon, not just colour, once it has been there too long', () => {
    renderDrawer({ record: inFlight(12) });
    const line = within(statusGroup()).getByText('อยู่ในขั้นนี้ 12 นาที');
    expect(line.querySelector('svg')).not.toBeNull();
  });

  test('says nothing about duration for a finished record', () => {
    renderDrawer();
    expect(statusGroup()).not.toHaveTextContent(/อยู่ในขั้นนี้/);
  });

  test('shows how many tries a retried record has used, and none for one never retried', () => {
    const { unmount } = renderDrawer({
      record: record({ state: 'Queued', outcome: 'error', attempts: 2 }),
    });
    expect(statusGroup()).toHaveTextContent('ลองแล้ว 2/3');
    unmount();

    renderDrawer();
    expect(statusGroup()).not.toHaveTextContent(/ลองแล้ว/);
  });
});

describe('ProcurementDrawer while loading', () => {
  test('is described and says it is loading', () => {
    renderDrawer({ record: null });

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAccessibleDescription(/กำลังโหลด/);
    const status = within(dialog).getByRole('status');
    expect(status).toHaveAttribute('aria-busy', 'true');
    expect(status).toHaveTextContent('กำลังโหลด');
  });
});
