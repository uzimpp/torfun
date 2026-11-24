import { render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { NotificationResponse, TorListItem } from '@torfun/types';

vi.mock('@/lib/api', () => ({
  ApiError: class ApiError extends Error {
    constructor(
      message: string,
      readonly status: number,
    ) {
      super(message);
    }
  },
  fetchProjects: vi.fn(),
  fetchFavorites: vi.fn(),
  fetchNotifications: vi.fn(),
}));

const api = await import('@/lib/api');
const { OfficerDashboard } = await import('./officer-dashboard');
const { orderTracked } = await import('./use-dashboard-data');

const tor = (id: string, over: Record<string, unknown> = {}): TorListItem =>
  ({
    projectId: id,
    projectName: `โครงการ ${id}`,
    deptName: 'กรมตัวอย่าง',
    projectMoney: 1_500_000,
    announceDate: '2026-11-24',
    timeline: { status: 'open', deadlineAt: '2099-01-01T09:00:00.000Z', commentsCloseAt: null },
    analysis: null,
    ...over,
  }) as unknown as TorListItem;

const change = (id: string): NotificationResponse =>
  ({
    id: `n-${id}`,
    project_id: id,
    project_name: `โครงการ ${id}`,
    event: 'status_changed',
    score: null,
    reasons: [],
    previous_status: 'drafting',
    status: 'open',
    deadline_at: null,
    read_at: null,
    created_at: '2026-11-24T03:00:00.000Z',
  }) as NotificationResponse;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.fetchNotifications).mockResolvedValue({ items: [], total: 0, unread_count: 0 });
  vi.mocked(api.fetchFavorites).mockResolvedValue({ favorites: [] });
});

describe('OfficerDashboard', () => {
  test("asks for today's announcements, newest first, five at a time", async () => {
    vi.mocked(api.fetchProjects).mockResolvedValue({
      items: [tor('p1'), tor('p2')],
      total: 2,
      limit: 5,
      offset: 0,
    });

    render(<OfficerDashboard />);

    const panel = await screen.findByRole('region', { name: 'ประกาศใหม่วันนี้' });
    expect(await within(panel).findByRole('link', { name: /โครงการ p1/ })).toHaveAttribute(
      'href',
      '/tor/p1',
    );
    const filters = vi.mocked(api.fetchProjects).mock.calls[0]?.[0] ?? {};
    expect(filters).toMatchObject({ order: 'announced', limit: 5, offset: 0 });
    expect(filters.publishedFrom).toBe(filters.publishedTo);
    expect(filters.publishedFrom).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  test('links to the full search only when more were announced than shown', async () => {
    vi.mocked(api.fetchProjects).mockResolvedValue({
      items: [tor('p1')],
      total: 12,
      limit: 5,
      offset: 0,
    });

    render(<OfficerDashboard />);

    expect(await screen.findByRole('link', { name: 'ดูประกาศทั้งหมด' })).toHaveAttribute(
      'href',
      '/search',
    );
    expect(screen.getByText(/ทั้งหมด 12 รายการ/)).toBeInTheDocument();
  });

  test('says so when nothing was announced today', async () => {
    vi.mocked(api.fetchProjects).mockResolvedValue({ items: [], total: 0, limit: 5, offset: 0 });

    render(<OfficerDashboard />);

    expect(await screen.findByText(/ยังไม่มีประกาศใหม่วันนี้/)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'ดูประกาศทั้งหมด' })).not.toBeInTheDocument();
  });

  test('shows followed TORs and their latest status changes', async () => {
    vi.mocked(api.fetchProjects).mockResolvedValue({ items: [], total: 0, limit: 5, offset: 0 });
    vi.mocked(api.fetchFavorites).mockResolvedValue({
      favorites: [{ project_id: 'f1', favorited_at: new Date(), procurement: tor('f1') }] as never,
    });
    vi.mocked(api.fetchNotifications).mockResolvedValue({
      items: [change('f1'), { ...change('x'), event: 'match_found' } as NotificationResponse],
      total: 2,
      unread_count: 2,
    });

    render(<OfficerDashboard />);

    const panel = await screen.findByRole('region', { name: 'ความเคลื่อนไหวของ TOR ที่ติดตาม' });
    await waitFor(() => expect(within(panel).getAllByRole('link')).toHaveLength(2));
    expect(within(panel).getByText(/ร่าง.*→.*เปิดรับข้อเสนอ/)).toBeInTheDocument();
    // A match alert is not a change to a followed TOR, so it is not listed here.
    expect(within(panel).queryByRole('link', { name: /โครงการ x/ })).not.toBeInTheDocument();
  });

  test('explains how to follow a TOR when none is saved', async () => {
    vi.mocked(api.fetchProjects).mockResolvedValue({ items: [], total: 0, limit: 5, offset: 0 });

    render(<OfficerDashboard />);

    expect(await screen.findByText(/ยังไม่ได้บันทึก TOR/)).toBeInTheDocument();
  });

  test('one panel failing leaves the other readable', async () => {
    vi.mocked(api.fetchProjects).mockRejectedValue(new api.ApiError('เชื่อมต่อไม่ได้', 0));
    vi.mocked(api.fetchFavorites).mockResolvedValue({ favorites: [] });

    render(<OfficerDashboard />);

    expect(await screen.findByRole('alert')).toHaveTextContent('เชื่อมต่อไม่ได้');
    expect(await screen.findByText(/ยังไม่ได้บันทึก TOR/)).toBeInTheDocument();
  });
});

describe('orderTracked', () => {
  const t = (name: string, deadlineMs: number | null) => ({
    item: tor(name, { projectName: name }),
    deadlineMs,
  });

  test('puts the soonest upcoming deadline first, and past or undated ones after', () => {
    const now = 1_000;
    const ordered = orderTracked([t('c', null), t('b', 5_000), t('past', 10), t('a', 2_000)], now);
    expect(ordered.map((x) => x.item.projectName)).toEqual(['a', 'b', 'c', 'past']);
  });
});
