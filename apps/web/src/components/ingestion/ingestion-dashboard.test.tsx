import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { IngestionFailure, IngestionOps, IngestionRun as RunLog } from '@torfun/types';

import type { IngestionSummaryResponse } from '@/lib/api';
import { IngestionDashboard } from './ingestion-dashboard';
import { dailyWindow, ZERO_DISCOVERED, ZERO_THROUGHPUT } from './ops-fixture';
import type { IngestionOpsData } from './use-ingestion-ops';
import type { IngestionRun } from './use-ingestion-run';

vi.mock('./use-ingestion-run', () => ({ useIngestionRun: vi.fn() }));
vi.mock('./use-ingestion-ops', () => ({ useIngestionOps: vi.fn() }));
vi.mock('./schedule-card', () => ({ ScheduleCard: () => <div>ตารางเวลา</div> }));

const { useIngestionRun } = await import('./use-ingestion-run');
const { useIngestionOps } = await import('./use-ingestion-ops');
const mockedRun = vi.mocked(useIngestionRun);
const mockedOps = vi.mocked(useIngestionOps);

const summary = (overrides: Partial<IngestionSummaryResponse> = {}): IngestionSummaryResponse => ({
  total: 288,
  byState: { Queued: 240, Processing: 3, Completed: 45 },
  byOutcome: { queued: 237, error: 3, downloading: 1, analysing: 2, tor_analysed: 45 },
  byAgency: [],
  byYear: [{ budgetYear: 2568, count: 3 }],
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

const runData = (overrides: Partial<IngestionRun> = {}): IngestionRun => ({
  summary: summary(),
  failures: [],
  loading: false,
  error: null,
  actionError: null,
  running: false,
  starting: false,
  updatedAt: null,
  startRun: vi.fn(),
  stopRun: vi.fn().mockResolvedValue(undefined),
  reload: vi.fn(),
  ...overrides,
});

const runLog = (overrides: Partial<RunLog> = {}): RunLog => ({
  id: 'run-1',
  startedAt: '2026-10-03T03:00:00.000Z',
  endedAt: '2026-10-03T03:09:06.000Z',
  durationMs: 546_000,
  trigger: 'scheduled',
  runners: 2,
  counts: null,
  error: null,
  tokens: { prompt: 120_000, output: 8_000, thoughts: 4_000, total: 132_000, calls: 12 },
  ...overrides,
});

const ops = (overrides: Partial<IngestionOps> = {}): IngestionOps => ({
  live: {
    runInProgress: false,
    runStartedAt: null,
    elapsedMs: null,
    stopRequested: false,
    inFlight: null,
    queueRemaining: null,
  },
  recordTimings: {
    sample: 40,
    p50Ms: 42_000,
    p90Ms: 95_000,
    downloadP50Ms: 8_000,
    analyseP50Ms: 30_000,
  },
  throughputDaily: dailyWindow(ZERO_THROUGHPUT),
  discoveredDaily: dailyWindow(ZERO_DISCOVERED),
  failuresByStage: [],
  runs: [runLog()],
  ...overrides,
});

const opsData = (overrides: Partial<IngestionOpsData> = {}): IngestionOpsData => ({
  ops: ops(),
  loading: false,
  error: null,
  updatedAt: null,
  reload: vi.fn(),
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  mockedOps.mockReturnValue(opsData());
});

const running = (overrides: Partial<IngestionSummaryResponse> = {}) =>
  runData({
    running: true,
    summary: summary({
      runInProgress: true,
      runStartedAt: new Date(Date.now() - 75_000).toISOString(),
      ...overrides,
    }),
  });

describe('operations only', () => {
  test('holds no procurement table, filters, held or dropped lists', () => {
    mockedRun.mockReturnValue(runData());
    render(<IngestionDashboard />);

    expect(screen.queryByLabelText('ปีงบประมาณ')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'อนุมัติ' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /ถูกคัดออก|รอตรวจสอบ/ })).not.toBeInTheDocument();
    expect(screen.getByText('ตารางเวลา')).toBeInTheDocument();
  });
});

describe('header', () => {
  test('the meta line carries today’s open-data quota, compactly', () => {
    mockedRun.mockReturnValue(
      runData({
        summary: summary({
          openDataQuota: {
            remainingDay: 450,
            limitDay: 1000,
            observedAt: new Date().toISOString(),
          },
        }),
      }),
    );
    render(<IngestionDashboard />);

    expect(screen.getByText('โควตา 450/1,000')).toBeInTheDocument();
  });

  test('a quota not read today is unknown in the meta line, not a stale figure', () => {
    mockedRun.mockReturnValue(
      runData({
        summary: summary({
          openDataQuota: {
            remainingDay: 0,
            limitDay: 1000,
            observedAt: new Date(Date.now() - 2 * 86_400_000).toISOString(),
          },
        }),
      }),
    );
    render(<IngestionDashboard />);

    expect(screen.getByText('โควตา ยังไม่ทราบ')).toBeInTheDocument();
  });
});

describe('run control', () => {
  test('the run button keeps its label and is disabled while a run is in flight', () => {
    mockedRun.mockReturnValue(running());
    render(<IngestionDashboard />);

    expect(screen.getByRole('button', { name: 'เริ่มรอบดึงข้อมูล' })).toBeDisabled();
  });

  test('when nothing is running there is no banner, and the last run is in the header', () => {
    mockedRun.mockReturnValue(runData());
    render(<IngestionDashboard />);

    expect(screen.queryByRole('status', { name: /กำลังรันรอบดึงข้อมูล/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'หยุดรอบนี้' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'งานที่กำลังทำ' })).not.toBeInTheDocument();
    expect(screen.getByText(/^รอบล่าสุด /)).toBeInTheDocument();
  });

  test('cannot be pressed again while a start is unanswered', () => {
    mockedRun.mockReturnValue(runData({ starting: true }));
    render(<IngestionDashboard />);

    expect(screen.getByRole('button', { name: 'เริ่มรอบดึงข้อมูล' })).toBeDisabled();
  });

  test('a refused stop is titled as a stop even once the run has ended', () => {
    mockedRun.mockReturnValue(
      runData({ actionError: { action: 'stop', error: { kind: 'broken', message: 'boom' } } }),
    );
    render(<IngestionDashboard />);

    expect(screen.getByRole('alert')).toHaveTextContent('หยุดรอบไม่สำเร็จ');
  });

  test('a refused start is titled as a start even once a run is going', () => {
    mockedRun.mockReturnValue({
      ...running(),
      actionError: { action: 'start', error: { kind: 'broken', message: 'boom' } },
    });
    render(<IngestionDashboard />);

    expect(screen.getByRole('alert')).toHaveTextContent('เริ่มรอบดึงข้อมูลไม่สำเร็จ');
  });
});

describe('the run banner', () => {
  test('shows where the work is and what is left', () => {
    mockedRun.mockReturnValue(running());
    render(<IngestionDashboard />);

    expect(screen.getByRole('status', { name: /กำลังรันรอบดึงข้อมูล/ })).toHaveTextContent(
      'ดึง 1 · ประมวลผล 2 · รอคิว 240',
    );
  });

  test('counts elapsed time as a clock, every second', async () => {
    vi.useFakeTimers();
    try {
      mockedRun.mockReturnValue(
        running({ runStartedAt: new Date(Date.now() - 10_000).toISOString() }),
      );
      render(<IngestionDashboard />);
      expect(screen.getByText('00:10')).toBeInTheDocument();

      await act(() => vi.advanceTimersByTimeAsync(3000));

      expect(screen.getByText('00:13')).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  test('asks before stopping, and says what stopping does', async () => {
    const data = running();
    mockedRun.mockReturnValue(data);
    render(<IngestionDashboard />);

    await userEvent.click(screen.getByRole('button', { name: 'หยุดรอบนี้' }));

    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('รายการที่กำลังทำอยู่จะทำต่อจนเสร็จ ที่เหลือจะยังอยู่ในคิว');
    expect(data.stopRun).not.toHaveBeenCalled();
  });

  test('confirming asks the API to stop, and the control waits while it does', async () => {
    let finish: () => void = () => {};
    const stopRun = vi.fn(() => new Promise<void>((resolve) => (finish = resolve)));
    mockedRun.mockReturnValue({ ...running(), stopRun });
    render(<IngestionDashboard />);

    await userEvent.click(screen.getByRole('button', { name: 'หยุดรอบนี้' }));
    await userEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'หยุดรอบนี้' }),
    );

    expect(stopRun).toHaveBeenCalledOnce();
    const pending = screen.getByRole('button', { name: 'กำลังหยุด' });
    expect(pending).toBeDisabled();
    expect(pending).toHaveAttribute('aria-busy', 'true');
    await act(async () => finish());
  });

  test('cancelling leaves the run going', async () => {
    const data = running();
    mockedRun.mockReturnValue(data);
    render(<IngestionDashboard />);

    await userEvent.click(screen.getByRole('button', { name: 'หยุดรอบนี้' }));
    await userEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'ไม่หยุด' }),
    );

    expect(data.stopRun).not.toHaveBeenCalled();
  });

  test('once asked to stop, says so and cannot be pressed again', () => {
    mockedRun.mockReturnValue(running({ stopRequested: true }));
    render(<IngestionDashboard />);

    const banner = screen.getByRole('status', { name: /กำลังหยุด/ });
    expect(banner).toHaveTextContent('รอรายการที่ทำอยู่ให้เสร็จ');
    expect(screen.getByRole('button', { name: 'กำลังหยุด' })).toBeDisabled();
  });
});

describe('live work', () => {
  test('lists what each runner holds, by slot, with its stage and a link to the record', () => {
    mockedRun.mockReturnValue(running());
    const since = new Date(Date.now() - 65_000).toISOString();
    mockedOps.mockReturnValue(
      opsData({
        ops: ops({
          live: {
            ...ops().live,
            runInProgress: true,
            queueRemaining: 99,
            inFlight: [
              {
                slot: 1,
                projectId: 'p2',
                projectName: 'งานที่สอง',
                stage: 'timeline',
                fresh: false,
                since,
              },
              {
                slot: 0,
                projectId: 'p1',
                projectName: 'งานแรก',
                stage: 'download',
                fresh: true,
                since,
              },
            ],
          },
        }),
      }),
    );
    render(<IngestionDashboard />);

    const items = within(screen.getByRole('list', { name: 'รายการที่กำลังทำ' })).getAllByRole(
      'listitem',
    );
    expect(items[0]).toHaveTextContent('งานแรก');
    expect(items[0]).toHaveTextContent('ดาวน์โหลดเอกสาร');
    expect(items[0]).not.toHaveTextContent('อัปเดตไทม์ไลน์เท่านั้น');
    expect(items[1]).toHaveTextContent('อัปเดตไทม์ไลน์เท่านั้น');
    expect(within(items[0]!).getByRole('link', { name: 'งานแรก' })).toHaveAttribute(
      'href',
      '/admin/procurements?id=p1',
    );
    expect(screen.getByText('เหลือในคิวรอบนี้ 99 รายการ')).toBeInTheDocument();
  });
});

describe('monitoring', () => {
  test('shows no metric tiles, memory or caveat footnotes', () => {
    mockedRun.mockReturnValue(runData());
    render(<IngestionDashboard />);

    expect(screen.queryByRole('list', { name: 'ตัวชี้วัดการทำงาน' })).not.toBeInTheDocument();
    expect(screen.queryByText(/หน่วยความจำ/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Cloud Run/)).not.toBeInTheDocument();
    expect(screen.queryByText(/ไม่รวมรายการที่ถูกคัดออก/)).not.toBeInTheDocument();
  });

  test('trend charts carry their figures in words and as a table, not only as marks', () => {
    mockedRun.mockReturnValue(runData());
    mockedOps.mockReturnValue(
      opsData({
        ops: ops({
          failuresByStage: [{ stage: 'download', count: 4 }],
        }),
      }),
    );
    render(<IngestionDashboard />);

    const trends = screen.getByRole('region', { name: 'แนวโน้ม' });
    for (const name of [
      'ประกาศที่พบต่อวัน (30 วัน)',
      'ผลการประมวลผลต่อวัน',
      'ข้อผิดพลาดตามขั้นตอน',
    ]) {
      expect(within(trends).getByRole('figure', { name })).toBeInTheDocument();
    }
    expect(
      within(trends).getByRole('group', { name: 'เวลาต่อรายการ (มัธยฐาน 30 วัน)' }),
    ).toHaveTextContent('42 วิ');
    const stages = within(screen.getByRole('figure', { name: 'ข้อผิดพลาดตามขั้นตอน' })).getByRole(
      'table',
    );
    expect(within(stages).getAllByRole('row')[1]).toHaveTextContent('ดาวน์โหลดเอกสาร4');
  });

  test('a failed read says why and offers a retry', async () => {
    const reload = vi.fn();
    mockedRun.mockReturnValue(runData());
    mockedOps.mockReturnValue(
      opsData({ ops: null, error: { kind: 'broken', message: 'boom' }, reload }),
    );
    render(<IngestionDashboard />);

    await userEvent.click(
      within(screen.getByRole('alert')).getByRole('button', { name: 'ลองอีกครั้ง' }),
    );
    expect(reload).toHaveBeenCalledOnce();
  });
});

describe('run history', () => {
  test('lists each recorded run with how it started, what it did and how it ended', () => {
    mockedRun.mockReturnValue(runData());
    mockedOps.mockReturnValue(
      opsData({
        ops: ops({
          runs: [
            runLog({
              counts: {
                discovered: 30,
                newRecords: 12,
                changedRecords: 0,
                unchangedRecords: 18,
                discoverySkipped: false,
                discoveryStopped: null,
                rejectedNonRegistry: 0,
                attempted: 9,
                refreshed: 2,
                archivesRetrieved: 8,
                torAnalysed: 5,
                held: 2,
                dropped: 1,
                failed: 1,
                aborted: true,
                stopped: null,
              },
            }),
          ],
        }),
      }),
    );
    render(<IngestionDashboard />);

    const history = screen.getByRole('region', { name: 'ประวัติรอบ' });
    const [header, row] = within(history).getAllByRole('row');
    expect(
      within(header!)
        .getAllByRole('columnheader')
        .map((cell) => cell.textContent),
    ).toEqual([
      'เริ่ม',
      'วิธีเริ่ม',
      'ระยะเวลา',
      'รายการที่ทำ',
      'วิเคราะห์แล้ว',
      'รอตรวจสอบ',
      'ล้มเหลว',
      'โทเคน',
      'ผล',
    ]);
    expect(
      within(row!)
        .getAllByRole('cell')
        .map((cell) => cell.textContent),
    ).toEqual([
      '3 ต.ค. 10:00',
      'ตามตาราง',
      '9 นาที 6 วิ',
      '9',
      '5',
      '2',
      '1',
      expect.stringContaining('132,000'),
      'เว็บปฏิเสธ',
    ]);
    expect(within(row!).getByRole('button', { name: '132,000' })).toHaveAccessibleDescription(
      /prompt 120,000 · output 8,000 · thinking 4,000 — นับโดย Gemini; ไม่รวมการเรียกที่ล้มเหลว/,
    );
  });

  test('before the first recorded run, says so in one sentence', () => {
    mockedRun.mockReturnValue(runData());
    mockedOps.mockReturnValue(opsData({ ops: ops({ runs: [] }) }));
    render(<IngestionDashboard />);

    const history = screen.getByRole('region', { name: 'ประวัติรอบ' });
    expect(history).toHaveTextContent('ยังไม่มีรอบที่บันทึก — เริ่มบันทึกตั้งแต่รอบถัดไป');
    expect(within(history).queryByRole('table')).not.toBeInTheDocument();
  });
});

describe('the failure log', () => {
  const failure = (overrides: Partial<IngestionFailure>): IngestionFailure => ({
    projectId: 'p1',
    projectName: 'จ้างพัฒนาระบบ',
    stage: 'download',
    error: 'HTTP 502',
    at: '2026-10-03T03:05:00.000Z',
    kind: 'fault',
    ...overrides,
  });

  test('groups by run, sets the no-TOR answers apart, links each to its record, and offers no retry', () => {
    mockedRun.mockReturnValue(
      runData({
        failures: [
          failure({}),
          failure({
            projectId: 'p2',
            stage: 'info',
            kind: 'no_tor',
            error: 'No zipId in the announcement response — no TOR package published.',
          }),
          failure({ projectId: 'p3', at: '2026-08-01T00:00:00.000Z' }),
        ],
      }),
    );
    render(<IngestionDashboard />);

    const log = document.getElementById('failures')!;
    const groups = log.querySelectorAll('details');
    expect(groups).toHaveLength(2);
    expect(groups[0]).toHaveTextContent('เป็นปัญหา 1 · ไม่ใช่ปัญหา 1');
    expect(groups[0]).toHaveTextContent('หน่วยงานไม่ได้เผยแพร่ TOR');
    expect(groups[1]).toHaveTextContent('ไม่อยู่ในรอบที่บันทึก');
    expect(within(log).getAllByRole('link')[0]).toHaveAttribute(
      'href',
      '/admin/procurements?id=p1',
    );
    expect(
      within(log).queryByRole('button', { name: /ลองใหม่|ลองอีกครั้ง/ }),
    ).not.toBeInTheDocument();
  });

  test('an empty log says there is nothing to look at', () => {
    mockedRun.mockReturnValue(runData());
    render(<IngestionDashboard />);

    expect(screen.getByText('ไม่มีข้อผิดพลาดที่บันทึกไว้')).toBeInTheDocument();
  });
});
