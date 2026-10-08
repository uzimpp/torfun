import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import type { IngestionSummaryResponse } from '@/lib/api';
import { IngestionDashboard } from './ingestion-dashboard';
import type { IngestionData } from './use-ingestion-data';

vi.mock('./use-ingestion-data', async () => {
  const actual =
    await vi.importActual<typeof import('./use-ingestion-data')>('./use-ingestion-data');
  return { ...actual, useIngestionData: vi.fn() };
});
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
  runInProgress: false,
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
