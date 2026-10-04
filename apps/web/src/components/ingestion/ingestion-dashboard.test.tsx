import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import type { IngestionSummaryResponse } from '@/lib/api';
import { IngestionDashboard } from './ingestion-dashboard';
import type { IngestionData } from './use-ingestion-data';

vi.mock('./use-ingestion-data', async () => {
  const actual =
    await vi.importActual<typeof import('./use-ingestion-data')>('./use-ingestion-data');
  return { ...actual, useIngestionData: vi.fn() };
});
vi.mock('@/lib/api', async () => ({
  ...(await vi.importActual<typeof import('@/lib/api')>('@/lib/api')),
  fetchProjects: vi.fn().mockResolvedValue({ items: [], total: 0 }),
}));
vi.mock('@/lib/api-tombstones', () => ({
  fetchTombstones: vi.fn().mockResolvedValue([]),
  removeTombstone: vi.fn(),
  restoreTombstone: vi.fn(),
}));
vi.mock('@/lib/api-procurement-actions', () => ({
  approveProcurement: vi.fn(),
  markNonSoftware: vi.fn(),
  deleteProcurement: vi.fn(),
}));
const { useIngestionData } = await import('./use-ingestion-data');
const mockedHook = vi.mocked(useIngestionData);

const summary = (overrides: Partial<IngestionSummaryResponse> = {}): IngestionSummaryResponse => ({
  total: 288,
  byState: { Queued: 240, Processing: 3, Completed: 45 },
  byOutcome: { queued: 237, error: 3, downloading: 1, analysing: 2, tor_analysed: 45 },
  byAgency: [],
  byYear: [],
  torDocumentsRetrieved: 45,
  totalTorBytes: 0,
  failureCount: 0,
  lastRunAt: '2026-09-30T10:00:00.000Z',
  openDataQuota: null,
  runInProgress: false,
  runStartedAt: null,
  stopRequested: false,
  agencies: [],
  ...overrides,
});

const data = (overrides: Partial<IngestionData> = {}): IngestionData => ({
  summary: summary(),
  projects: [],
  total: 0,
  failures: [],
  loading: false,
  error: null,
  sessionEnded: false,
  running: false,
  startRun: vi.fn(),
  stopRun: vi.fn(),
  retry: vi.fn(),
  ...overrides,
});

beforeEach(() => vi.clearAllMocks());

describe('the live run banner', () => {
  test('appears while a run is in flight, announcing the stage and what is left', () => {
    mockedHook.mockReturnValue(data({ running: true, summary: summary({ runInProgress: true }) }));
    render(<IngestionDashboard />);

    const banner = screen.getByRole('status', { name: /กำลังรันรอบดึงข้อมูล/ });
    expect(banner).toHaveTextContent('ดึงข้อมูล 1 · ประมวลผล 2 · รอคิว 240');
  });

  test('is not there when nothing is running, and the last run is shown instead', () => {
    mockedHook.mockReturnValue(data());
    render(<IngestionDashboard />);

    expect(screen.queryByRole('status', { name: /กำลังรันรอบดึงข้อมูล/ })).not.toBeInTheDocument();
    expect(screen.getByText(/รอบล่าสุด/)).toBeInTheDocument();
  });

  test('the run button is disabled while a run is in flight', () => {
    mockedHook.mockReturnValue(data({ running: true, summary: summary({ runInProgress: true }) }));
    render(<IngestionDashboard />);

    expect(screen.getByRole('button', { name: /กำลังดึงข้อมูล/ })).toBeDisabled();
  });
});

describe('the run banner: how long, and stopping', () => {
  const running = (overrides: Partial<IngestionSummaryResponse> = {}) =>
    data({
      running: true,
      summary: summary({
        runInProgress: true,
        runStartedAt: new Date(Date.now() - 75_000).toISOString(),
        ...overrides,
      }),
    });

  test('says how long the run has been going', () => {
    mockedHook.mockReturnValue(running());
    render(<IngestionDashboard />);

    expect(screen.getByRole('status', { name: /กำลังรันรอบดึงข้อมูล/ })).toHaveTextContent(
      /รันมาแล้ว 1 นาที \d+ วิ/,
    );
  });

  test('counts in seconds while a run is going', async () => {
    vi.useFakeTimers();
    try {
      mockedHook.mockReturnValue(
        running({ runStartedAt: new Date(Date.now() - 10_000).toISOString() }),
      );
      render(<IngestionDashboard />);
      expect(screen.getByText(/รันมาแล้ว 10 วิ/)).toBeInTheDocument();

      await act(() => vi.advanceTimersByTimeAsync(3000));

      expect(screen.getByText(/รันมาแล้ว 13 วิ/)).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  test('offers to stop, and asks first, saying what stopping does', async () => {
    const stopRun = vi.fn();
    mockedHook.mockReturnValue({ ...running(), stopRun });
    render(<IngestionDashboard />);

    await userEvent.click(screen.getByRole('button', { name: 'หยุดรอบนี้' }));

    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('รายการที่กำลังทำอยู่จะทำต่อจนเสร็จ ที่เหลือจะยังอยู่ในคิว');
    expect(stopRun).not.toHaveBeenCalled(); // nothing happens until it is confirmed
  });

  test('confirming asks the API to stop', async () => {
    const stopRun = vi.fn();
    mockedHook.mockReturnValue({ ...running(), stopRun });
    render(<IngestionDashboard />);

    await userEvent.click(screen.getByRole('button', { name: 'หยุดรอบนี้' }));
    await userEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'หยุดรอบนี้' }),
    );

    expect(stopRun).toHaveBeenCalledOnce();
  });

  test('cancelling leaves the run going', async () => {
    const stopRun = vi.fn();
    mockedHook.mockReturnValue({ ...running(), stopRun });
    render(<IngestionDashboard />);

    await userEvent.click(screen.getByRole('button', { name: 'หยุดรอบนี้' }));
    await userEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'ไม่หยุด' }),
    );

    expect(stopRun).not.toHaveBeenCalled();
  });

  test('once asked to stop, says it is stopping and the button cannot be pressed again', () => {
    mockedHook.mockReturnValue(running({ stopRequested: true }));
    render(<IngestionDashboard />);

    const banner = screen.getByRole('status', { name: /กำลังหยุด/ });
    expect(banner).toHaveTextContent('รอรายการที่ทำอยู่ให้เสร็จ');
    expect(within(banner).getByRole('button', { name: /กำลังหยุด/ })).toBeDisabled();
  });

  test('there is no banner and no stop button when nothing is running', () => {
    mockedHook.mockReturnValue(data());
    render(<IngestionDashboard />);

    expect(screen.queryByRole('button', { name: 'หยุดรอบนี้' })).not.toBeInTheDocument();
  });
});

describe('administrator actions', () => {
  test('one that goes through reads the console again, so the table and cards agree', async () => {
    const { fetchProjects } = await import('@/lib/api');
    const { approveProcurement } = await import('@/lib/api-procurement-actions');
    const held = {
      projectId: '66059313551',
      projectName: 'จ้างพัฒนาระบบ',
      outcome: 'needs_review',
      holdReason: 'ai_low_confidence',
      analysis: null,
    };
    vi.mocked(fetchProjects).mockResolvedValue({
      items: [held],
      total: 1,
      limit: 50,
      offset: 0,
    } as never);
    vi.mocked(approveProcurement).mockResolvedValue(undefined);
    const retry = vi.fn();
    mockedHook.mockReturnValue(data({ retry }));
    render(<IngestionDashboard />);

    const card = (await screen.findByRole('button', { name: 'อนุมัติ' })).closest(
      '[data-slot="card"]',
    ) as HTMLElement;
    await userEvent.click(await within(card).findByRole('button', { name: 'อนุมัติ' }));
    await userEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'อนุมัติ' }),
    );

    expect(retry).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => expect(vi.mocked(fetchProjects).mock.calls.length).toBeGreaterThan(1));
  });
});
