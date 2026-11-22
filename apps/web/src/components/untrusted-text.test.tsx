import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import {
  EMPTY_TIMELINE,
  type IngestionFailure,
  type NotificationResponse,
  type Procurement,
  type TorReportResponse,
} from '@torfun/types';

import { NotificationItem } from '@/components/notifications/notification-item';
import { FailureLog } from '@/components/ingestion/failure-log';
import { TorReportCard } from '@/components/admin/tor-report-card';
import { ProcurementDrawer } from '@/components/procurements/procurement-drawer';
import { SearchResults } from '@/components/search/search-results';
import { EMPTY_SEARCH_FILTERS } from '@/components/search/search-filter-values';
import { useTorSearch } from '@/components/search/use-tor-search';
import { TorReviewContent } from '@/components/tor-review/tor-review-content';
import { HOSTILE_TEXT, expectInert } from '@/test/xss-payloads';

/**
 * ASVS V3.2.2 / threat T-08: text from an agency, a TOR, the model or another
 * user must reach the page as text. Every screen below is given a hostile string
 * in every field it prints, and must show it literally without growing elements,
 * handlers or `javascript:` links. This is the evidence for "test stored XSS".
 */

vi.mock('next/navigation', () => ({ useRouter: () => ({ back: vi.fn(), push: vi.fn() }) }));
vi.mock('@/components/search/use-tor-search', () => ({
  RESULT_LIMIT: 20,
  useTorSearch: vi.fn(),
}));
vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  fetchTor: vi.fn(),
  fetchTorMatch: vi.fn(),
}));

const api = await import('@/lib/api');
const mocked = vi.mocked(api);

const NOW = new Date('2026-09-30T12:00:00.000Z');

function procurement(overrides: Partial<Procurement> = {}): Procurement {
  return {
    projectId: 'project-123',
    projectName: HOSTILE_TEXT,
    deptName: HOSTILE_TEXT,
    deptSubName: null,
    deptCode: '1234567890',
    announceDate: '2026-09-01',
    purchaseMethodName: HOSTILE_TEXT,
    discoveredAt: '2026-09-01T00:00:00.000Z',
    budgetYear: 2569,
    typeId: null,
    goodsId: null,
    projectMoney: 1_000_000,
    priceBuild: null,
    detailReadAt: '2026-09-01T00:00:00.000Z',
    timeline: { ...EMPTY_TIMELINE, status: 'open' },
    state: 'Completed',
    outcome: 'tor_analysed',
    attempts: 0,
    holdReason: null,
    statusHistory: [],
    approved: null,
    archive: { zipId: 'zip-1', documents: [], torAmbiguous: false },
    analysis: {
      summary: HOSTILE_TEXT,
      scopeOfWork: [HOSTILE_TEXT],
      budgetThb: null,
      deadlineAt: null,
      durationDays: null,
      techStack: [HOSTILE_TEXT],
      targetPlatforms: [],
      requiredQualifications: [],
      reason: HOSTILE_TEXT,
    },
    updatedAt: '2026-09-01T00:00:00.000Z',
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  delete (window as unknown as { __xss?: number }).__xss;
});

afterEach(() => {
  cleanup();
});

describe('untrusted text stays text', () => {
  test('search result card: title, agency and AI summary', () => {
    vi.mocked(useTorSearch).mockReturnValue({
      items: [procurement()],
      total: 1,
      loading: false,
      block: null,
      detail: null,
    });

    render(
      <SearchResults
        filters={EMPTY_SEARCH_FILTERS}
        page={1}
        onPageChange={vi.fn()}
        onOrderChange={vi.fn()}
      />,
    );

    expectInert();
  });

  test('procurement drawer: title, agency and every AI-read field', () => {
    render(
      <ProcurementDrawer
        open
        record={procurement()}
        error={null}
        now={NOW}
        onRetry={vi.fn()}
        onClose={vi.fn()}
        onActionDone={vi.fn()}
      />,
    );

    expectInert();
  });

  test('TOR review page: title, agency, method, summary, scope and reason', async () => {
    mocked.fetchTor.mockResolvedValue(procurement());
    mocked.fetchTorMatch.mockResolvedValue({ match: null });

    render(<TorReviewContent projectId="project-123" />);

    await screen.findByRole('heading', { level: 1 });
    expectInert();
  });

  test("admin report card: another user's report text, name and the review note", () => {
    const report = {
      id: 'r1',
      project_id: 'project-123',
      project_name: HOSTILE_TEXT,
      dept_name: HOSTILE_TEXT,
      reporter: { id: 'u1', username: 'officer', full_name: HOSTILE_TEXT, email: null },
      reason: 'other',
      details: HOSTILE_TEXT,
      created_at: '2026-09-01T00:00:00.000Z',
      status: 'removed',
      review: {
        reviewer: { id: 'u2', username: 'admin', full_name: HOSTILE_TEXT, email: null },
        reviewed_at: '2026-09-02T00:00:00.000Z',
        note: HOSTILE_TEXT,
      },
    } as TorReportResponse;

    render(<TorReportCard report={report} onReview={vi.fn()} />);

    expectInert();
  });

  test('ingestion failure log: project name and the upstream error message', () => {
    const failure: IngestionFailure = {
      projectId: 'project-123',
      projectName: HOSTILE_TEXT,
      stage: 'download',
      kind: 'fault',
      error: HOSTILE_TEXT,
      at: '2026-09-01T00:00:00.000Z',
    };

    render(<FailureLog failures={[failure]} runs={[]} liveStartedAt={null} />);

    expectInert();
  });

  test('notification: project name and match reasons', () => {
    const item: NotificationResponse = {
      id: 'n1',
      project_id: 'project-123',
      project_name: HOSTILE_TEXT,
      event: 'match_found',
      score: 0.8,
      scoring_version: 'qualification-clauses-v1',
      reasons: [HOSTILE_TEXT],
      previous_status: null,
      status: 'open',
      deadline_at: null,
      read_at: null,
      created_at: '2026-09-01T00:00:00.000Z',
    };

    render(
      <ul>
        <NotificationItem item={item} busy={false} onAction={vi.fn()} />
      </ul>,
    );

    expectInert();
  });

  /**
   * The harness itself must be able to fail, or none of the above proves
   * anything. Each host below prints every payload as text (so the text check
   * passes) and adds one live element, so only the structural check can trip.
   */
  describe('the check fails when a string was turned into something live', () => {
    const hostWith = (build: () => Element) => {
      const host = document.createElement('div');
      host.textContent = HOSTILE_TEXT;
      host.append(build());
      return host;
    };

    test.each([
      ['a script element', () => document.createElement('script')],
      ['an iframe', () => document.createElement('iframe')],
      [
        'an event-handler attribute',
        () => {
          const image = document.createElement('img');
          image.setAttribute('onerror', 'alert(1)');
          return image;
        },
      ],
      [
        'a javascript: link',
        () => {
          const link = document.createElement('a');
          link.setAttribute('href', 'javascript:alert(1)');
          return link;
        },
      ],
      [
        'a data: link',
        () => {
          const link = document.createElement('a');
          link.setAttribute('href', 'data:text/html,<script>1</script>');
          return link;
        },
      ],
    ])('%s', (_label, build) => {
      expect(() => expectInert(hostWith(build))).toThrow();
    });

    test('and passes on text alone', () => {
      const host = document.createElement('div');
      host.textContent = HOSTILE_TEXT;
      expect(() => expectInert(host)).not.toThrow();
    });
  });
});
