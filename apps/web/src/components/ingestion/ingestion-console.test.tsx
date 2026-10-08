import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import type { Procurement } from '@torfun/types';

import type { IngestionSummaryResponse } from '@/lib/api';
import { FilterBar } from './filter-bar';
import { ProjectTable } from './project-table';
import { SummaryCards } from './summary-cards';
import { EMPTY_FILTERS } from './use-ingestion-data';

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
    registryName: 'กรุงเทพมหานคร',
    deptCode: '3100001',
    year: 2568,
    announceDate: null,
    projectTypeName: null,
    purchaseMethodName: null,
    projectMoney: 16773380,
    priceBuild: null,
    status: 'unknown',
    statusSource: null,
    upstreamStatus: null,
    matchedKeywords: [],
    softwareClass: 'new_build',
    softwareScore: 1,
    eBidding: true,
    state: 'Completed',
    outcome: 'tor_analysed',
    attempts: 0,
    statusHistory: [
      { state: 'Queued', outcome: 'queued', at: minutesAgo(600) },
      { state: 'Processing', outcome: 'downloading', at: minutesAgo(30) },
      { state: 'Completed', outcome: 'tor_analysed', at: minutesAgo(10) },
    ],
    zipId: null,
    zipBytes: null,
    archiveMemberCount: null,
    archiveMembers: [],
    documents: [],
    analysis: null,
    winner: null,
    torAmbiguous: false,
    discoveredAt: minutesAgo(700),
    sourceHash: null,
    lastSeenAt: null,
    changedAt: null,
    updatedAt: minutesAgo(10),
    ...overrides,
  };
}

const renderTable = (
  projects: Procurement[],
  extra: { loading?: boolean; onClearFilters?: () => void } = {},
) =>
  render(
    <ProjectTable
      projects={projects}
      total={projects.length}
      loading={extra.loading ?? false}
      now={NOW}
      onClearFilters={extra.onClearFilters ?? (() => {})}
    />,
  );

describe('ProjectTable columns', () => {
  test('keeps state, outcome and procurement status in three separate Thai columns', () => {
    renderTable([record()]);

    const headers = screen.getAllByRole('columnheader').map((header) => header.textContent);
    expect(headers).toContain('สถานะการประมวลผล');
    expect(headers).toContain('ผลการประมวลผล');
    expect(headers).toContain('สถานะโครงการ');
  });

  test('shows each value in Thai, with no English enum name anywhere in the row', () => {
    renderTable([record({ status: 'contracted', statusSource: 'upstream' })]);

    const row = screen.getAllByRole('row')[1]!;
    expect(row).toHaveTextContent('เสร็จสิ้น');
    expect(row).toHaveTextContent('วิเคราะห์ TOR แล้ว');
    expect(row).toHaveTextContent('ทำสัญญาแล้ว');
    expect(row).not.toHaveTextContent('Completed');
  });

  test('a status Gemini read is marked as an assessment, and one the feed gave is not', () => {
    renderTable([
      record({ projectId: 'a', status: 'drafting', statusSource: 'ai' }),
      record({ projectId: 'b', status: 'contracted', statusSource: 'upstream' }),
      record({ projectId: 'c', status: 'unknown', statusSource: null }),
    ]);

    const [, ai, upstream, unknown] = screen.getAllByRole('row');
    expect(ai).toHaveTextContent('ร่าง / เตรียมการ');
    expect(ai).toHaveTextContent('AI ประเมิน');
    expect(upstream).not.toHaveTextContent('AI ประเมิน');
    expect(unknown).toHaveTextContent('ยังไม่ระบุ');
  });
});

describe('ProjectTable on a narrow screen', () => {
  test('keeps the year, budget and TOR count beside the title, since their columns are hidden', () => {
    renderTable([
      record({
        year: 2568,
        projectMoney: 16773380,
        documents: [
          {
            member: 'Attach_TOR_1.pdf',
            filename: 'Attach_TOR_1.pdf',
            bytes: 1000,
            namePattern: 'canonical',
            role: 'main_tor',
            note: '',
          },
        ],
      }),
    ]);

    const compact = screen.getByText(/^ปี 2568/);
    expect(compact).toHaveTextContent('ปี 2568 · 16,773,380 บาท · TOR 1 ไฟล์');
    // Shown only where the columns are not, so wide screens do not read it twice.
    expect(compact.className).toContain('xl:hidden');
  });

  test('says there is no budget rather than printing a bare dash', () => {
    renderTable([record({ projectMoney: null })]);
    expect(screen.getByText(/^ปี 2568/)).toHaveTextContent('ไม่ระบุงบประมาณ');
  });
});

describe('ProjectTable progress', () => {
  const inFlight = (minutes: number) =>
    record({
      state: 'Processing',
      outcome: 'analysing',
      statusHistory: [{ state: 'Processing', outcome: 'analysing', at: minutesAgo(minutes) }],
      updatedAt: minutesAgo(minutes),
    });

  test('says how long a Processing record has been in its stage', () => {
    renderTable([inFlight(3)]);
    expect(screen.getByText('อยู่ในขั้นนี้ 3 นาที')).toBeInTheDocument();
    expect(screen.queryByText(/นานกว่าปกติ/)).not.toBeInTheDocument();
  });

  test('warns in words, not just colour, once it has been there too long', () => {
    renderTable([inFlight(12)]);
    expect(screen.getByText('อยู่ในขั้นนี้ 12 นาที')).toBeInTheDocument();
    expect(screen.getByText(/นานกว่าปกติ/)).toBeInTheDocument();
  });

  test('says nothing about duration for a finished record', () => {
    renderTable([record()]);
    expect(screen.queryByText(/อยู่ในขั้นนี้/)).not.toBeInTheDocument();
  });

  test('shows how many tries a retried record has used', () => {
    renderTable([record({ state: 'Queued', outcome: 'error', attempts: 2 })]);
    expect(screen.getByText('ลองแล้ว 2/3')).toBeInTheDocument();
  });

  test('shows no attempt count for a record never retried', () => {
    renderTable([record()]);
    expect(screen.queryByText(/ลองแล้ว/)).not.toBeInTheDocument();
  });
});

describe('ProjectTable history', () => {
  test('a row opens on its title button and reports that with aria-expanded', () => {
    renderTable([record()]);

    const toggle = screen.getByRole('button', { name: /ประกวดราคาจ้างพัฒนาระบบสารสนเทศ/ });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
  });

  test('the timeline reads state, outcome and any failure reason in Thai', () => {
    renderTable([
      record({
        state: 'Queued',
        outcome: 'error',
        attempts: 1,
        statusHistory: [
          { state: 'Queued', outcome: 'queued', at: minutesAgo(60) },
          { state: 'Processing', outcome: 'downloading', at: minutesAgo(30) },
          { state: 'Queued', outcome: 'error', at: minutesAgo(20), detail: 'HTTP 502' },
        ],
      }),
    ]);

    fireEvent.click(screen.getByRole('button', { name: /ประกวดราคาจ้างพัฒนาระบบสารสนเทศ/ }));

    const timeline = screen.getByRole('list', { name: 'ประวัติสถานะ' });
    const entries = within(timeline).getAllByRole('listitem');
    expect(entries).toHaveLength(3);
    expect(entries[1]).toHaveTextContent('กำลังดำเนินการ');
    expect(entries[1]).toHaveTextContent('กำลังดึงข้อมูล');
    expect(entries[2]).toHaveTextContent('ดึงข้อมูลผิดพลาด (จะลองใหม่)');
    expect(entries[2]).toHaveTextContent('HTTP 502');
  });
});

describe('ProjectTable empty and loading', () => {
  test('while loading, holds the table open with placeholder rows and says it is busy', () => {
    renderTable([], { loading: true });
    expect(screen.getByRole('table')).toHaveAttribute('aria-busy', 'true');
    expect(screen.queryByText('ไม่พบรายการที่ตรงกับตัวกรอง')).not.toBeInTheDocument();
  });

  test('an empty result says why and offers to clear the filters', () => {
    const onClearFilters = vi.fn();
    renderTable([], { onClearFilters });

    expect(screen.getByText('ไม่พบรายการที่ตรงกับตัวกรอง')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'ล้างตัวกรอง' }));
    expect(onClearFilters).toHaveBeenCalledTimes(1);
  });
});

describe('FilterBar', () => {
  const renderBar = (values = EMPTY_FILTERS, onChange = vi.fn()) => {
    render(
      <FilterBar values={values} onChange={onChange} agencies={['กรุงเทพมหานคร']} years={[2568]} />,
    );
    return onChange;
  };

  test('filters by state, outcome and procurement status, each labelled in Thai', () => {
    renderBar();

    expect(screen.getByLabelText('สถานะการประมวลผล')).toBeInTheDocument();
    expect(screen.getByLabelText('ผลการประมวลผล')).toBeInTheDocument();
    expect(screen.getByLabelText('สถานะโครงการ')).toBeInTheDocument();
  });

  test('offers the shared Thai labels as options, not enum names', () => {
    renderBar();

    const outcome = screen.getByLabelText('ผลการประมวลผล');
    expect(within(outcome).getByRole('option', { name: 'กำลังประมวลผล' })).toBeInTheDocument();
    expect(
      within(outcome).getByRole('option', { name: 'AI: ไม่ใช่งานซอฟต์แวร์' }),
    ).toBeInTheDocument();
    const state = screen.getByLabelText('สถานะการประมวลผล');
    expect(within(state).getByRole('option', { name: 'รอคิว' })).toBeInTheDocument();
    expect(within(state).queryByRole('option', { name: 'Queued' })).not.toBeInTheDocument();
    const status = screen.getByLabelText('สถานะโครงการ');
    expect(within(status).getByRole('option', { name: 'ร่าง / เตรียมการ' })).toBeInTheDocument();
    expect(within(status).getByRole('option', { name: 'ยังไม่ระบุ' })).toBeInTheDocument();
  });

  test('choosing an outcome reports just that change', () => {
    const onChange = renderBar();
    fireEvent.change(screen.getByLabelText('ผลการประมวลผล'), { target: { value: 'analysing' } });
    expect(onChange).toHaveBeenCalledWith({ outcome: 'analysing' });
  });

  test('offers to clear the filters only when some are set', () => {
    renderBar();
    expect(screen.queryByRole('button', { name: 'ล้างตัวกรอง' })).not.toBeInTheDocument();
  });

  test('clearing resets every filter at once', () => {
    const onChange = renderBar({ ...EMPTY_FILTERS, outcome: 'analysing', status: 'drafting' });
    fireEvent.click(screen.getByRole('button', { name: 'ล้างตัวกรอง' }));
    expect(onChange).toHaveBeenCalledWith(EMPTY_FILTERS);
  });
});

describe('SummaryCards', () => {
  const summary: IngestionSummaryResponse = {
    total: 288,
    byState: { Queued: 243, Processing: 3, Completed: 44, Failed: 1 },
    byOutcome: { queued: 243, downloading: 1, analysing: 2, tor_analysed: 38 },
    byAgency: [],
    byYear: [],
    torDocumentsRetrieved: 38,
    totalTorBytes: 70_900_000,
    failureCount: 4,
    lastRunAt: null,
    openDataQuota: null,
    runInProgress: false,
    agencies: [],
  };

  test('shows fetching and analysing as their own tiles', () => {
    render(<SummaryCards summary={summary} />);

    expect(screen.getByRole('group', { name: 'กำลังดึงข้อมูล' })).toHaveTextContent('1');
    expect(screen.getByRole('group', { name: 'กำลังประมวลผล' })).toHaveTextContent('2');
  });

  test('still shows the total, the queue, the successes and the failures', () => {
    render(<SummaryCards summary={summary} />);

    for (const label of ['ประกาศทั้งหมด', 'รอดำเนินการ', 'สำเร็จ', 'ล้มเหลว']) {
      expect(screen.getByRole('group', { name: label })).toBeInTheDocument();
    }
  });
});
