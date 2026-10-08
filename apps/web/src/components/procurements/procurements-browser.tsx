'use client';

import { useRef, useState, type KeyboardEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, ChevronLeft, ChevronRight, FilterX, Inbox, SearchX } from 'lucide-react';
import type { Procurement } from '@torfun/types';
import { AdminLoadError } from '@/components/admin/admin-load-error';
import { ADMIN_LINK, AdminPage, EmptyState } from '@/components/admin/admin-ui';
import {
  ProjectActionDialog,
  type ProjectAction,
} from '@/components/ingestion/project-action-dialog';
import { useNow } from '@/components/ingestion/use-now';
import { useRunSummary } from '@/components/ingestion/use-run-summary';
import { PageHeader } from '@/components/layout/page-header';
import { Button, buttonVariants } from '@/components/ui/button';
import { formatCount } from '@/lib/format-number';
import { cn } from '@/lib/utils';
import { DroppedList } from './dropped-list';
import { ProcurementDrawer } from './procurement-drawer';
import { ProcurementFilterRow } from './procurement-filter-row';
import {
  EMPTY_PROCUREMENT_FILTERS,
  PROCUREMENT_PAGE_SIZE,
  procurementsHref,
  withFilters,
  type ProcurementListFilters,
  type ProcurementUrlState,
  type ProcurementView,
} from './procurement-filter-values';
import { ProcurementTable } from './procurement-table';
import { useDroppedList } from './use-dropped-list';
import { useProcurementList } from './use-procurement-list';
import { useProcurementRecord } from './use-procurement-record';

const TABS: Array<{ view: ProcurementView; label: string }> = [
  { view: 'all', label: 'ทั้งหมด' },
  { view: 'dropped', label: 'ถูกคัดออก' },
];

/** The tab an arrow, Home or End key moves to, or null for any other key. */
function tabIndexFor(key: string, current: number): number | null {
  const last = TABS.length - 1;
  switch (key) {
    case 'ArrowRight':
      return current === last ? 0 : current + 1;
    case 'ArrowLeft':
      return current === 0 ? last : current - 1;
    case 'Home':
      return 0;
    case 'End':
      return last;
    default:
      return null;
  }
}

function filtersActive(url: ProcurementListFilters): boolean {
  return (Object.keys(EMPTY_PROCUREMENT_FILTERS) as Array<keyof ProcurementListFilters>).some(
    (key) => url[key] !== EMPTY_PROCUREMENT_FILTERS[key],
  );
}

function ListEmpty({ filtered, onClear }: { filtered: boolean; onClear: () => void }) {
  return filtered ? (
    <EmptyState
      icon={SearchX}
      title="ไม่พบประกาศที่ตรงกับตัวกรอง"
      action={
        <Button variant="outline" size="sm" onClick={onClear}>
          <FilterX className="size-4" aria-hidden="true" />
          ล้างตัวกรองทั้งหมด
        </Button>
      }
    />
  ) : (
    <EmptyState
      icon={Inbox}
      title="ยังไม่มีประกาศในระบบ"
      hint="ประกาศจะเข้ามาเมื่อรอบดึงข้อมูลทำงาน"
      action={
        <Link
          href="/admin/ingestion"
          className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}
        >
          ไปที่ระบบดึงข้อมูล
          <ArrowRight className="size-4" aria-hidden="true" />
        </Link>
      }
    />
  );
}

function Pagination({
  page,
  total,
  onPage,
}: {
  page: number;
  total: number;
  onPage: (page: number) => void;
}) {
  const start = (page - 1) * PROCUREMENT_PAGE_SIZE + 1;
  const end = Math.min(page * PROCUREMENT_PAGE_SIZE, total);
  const last = Math.max(1, Math.ceil(total / PROCUREMENT_PAGE_SIZE));
  return (
    <nav aria-label="หน้ารายการ" className="flex items-center justify-between gap-4">
      <p className="text-muted-foreground text-xs tabular-nums">
        {total > 0
          ? `${formatCount(start)}–${formatCount(end)} จาก ${formatCount(total)}`
          : '0 รายการ'}
      </p>
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="icon"
          aria-label="หน้าก่อนหน้า"
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
        >
          <ChevronLeft className="size-4" aria-hidden="true" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          aria-label="หน้าถัดไป"
          disabled={page >= last}
          onClick={() => onPage(page + 1)}
        >
          <ChevronRight className="size-4" aria-hidden="true" />
        </Button>
      </div>
    </nav>
  );
}

/**
 * `/admin/procurements`: every ingested record, filtered and paged by the URL,
 * with one record open in a side drawer by `?id=`. The URL is the state: a view
 * can be bookmarked or linked to from the dashboard, and Back leaves the page
 * rather than undoing each filter.
 */
export function ProcurementsBrowser({ initialUrl }: { initialUrl: ProcurementUrlState }) {
  const router = useRouter();
  const [url, setUrl] = useState(initialUrl);
  const incomingHref = procurementsHref(initialUrl);
  const [seenHref, setSeenHref] = useState(incomingHref);
  if (incomingHref !== seenHref) {
    setSeenHref(incomingHref);
    setUrl(initialUrl);
  }

  const navigate = (next: ProcurementUrlState, { scroll = false } = {}) => {
    setUrl(next);
    router.replace(procurementsHref(next), { scroll });
  };

  const { summary, running } = useRunSummary();
  const list = useProcurementList(url, url.page, { live: running });
  const droppedView = url.view === 'dropped';
  const dropped = useDroppedList(droppedView);
  const selected = useProcurementRecord(url.id, list.items, list.loading);
  const now = useNow(30_000);
  const [acting, setActing] = useState<{ record: Procurement; action: ProjectAction } | null>(null);

  const applyFilters = (patch: Partial<ProcurementListFilters>) =>
    navigate(withFilters(url, patch));
  const openRecord = (id: string) => navigate({ ...url, id });
  const closeRecord = () => navigate({ ...url, id: '' });

  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const selectTab = (view: ProcurementView) => {
    if (view !== url.view) navigate({ ...url, view, page: 1, id: '' });
  };
  const onTabKey = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const next = tabIndexFor(event.key, index);
    if (next === null) return;
    event.preventDefault();
    tabRefs.current[next]?.focus();
    selectTab(TABS[next]!.view);
  };

  const total = droppedView ? (dropped.items?.length ?? null) : list.loading ? null : list.total;
  const showEmpty = !list.loading && !list.error && list.items.length === 0;

  return (
    <AdminPage>
      <PageHeader
        crumbs={[{ label: 'ผู้ดูแลระบบ', href: '/dashboard' }, { label: 'ประกาศที่ดึงเข้าระบบ' }]}
        title={
          <span className="inline-flex flex-wrap items-baseline gap-x-3">
            ประกาศที่ดึงเข้าระบบ
            {total === null ? (
              <span
                aria-hidden="true"
                className="bg-muted inline-block h-5 w-12 self-center rounded-md motion-safe:animate-pulse"
              />
            ) : (
              <span className="text-muted-foreground text-lg font-normal">
                {droppedView ? 'ถูกคัดออก ' : null}
                <span className="tabular-nums">{formatCount(total)}</span>
              </span>
            )}
          </span>
        }
        description="ประกาศที่ระบบดึงเข้ามา สถานะการดึงเอกสาร TOR และรายการที่ถูกคัดออก"
        actions={
          running ? (
            <Link href="/admin/ingestion" className={ADMIN_LINK}>
              <span
                aria-hidden="true"
                className="bg-primary size-2 rounded-full motion-safe:animate-pulse"
              />
              กำลังดึงข้อมูล · ระบบดึงข้อมูล
            </Link>
          ) : null
        }
      />

      <div className="flex flex-col gap-6">
        <div role="tablist" aria-label="มุมมอง" className="flex gap-6 border-b">
          {TABS.map((tab, index) => {
            const active = url.view === tab.view;
            return (
              <button
                key={tab.view}
                ref={(node) => {
                  tabRefs.current[index] = node;
                }}
                type="button"
                role="tab"
                id={`tab-${tab.view}`}
                aria-selected={active}
                aria-controls="procurements-panel"
                tabIndex={active ? 0 : -1}
                onClick={() => selectTab(tab.view)}
                onKeyDown={(event) => onTabKey(event, index)}
                className={cn(
                  'focus-visible:ring-ring/50 -mb-px border-b-2 px-0.5 pb-2.5 text-sm outline-none focus-visible:ring-[3px]',
                  active
                    ? 'border-primary text-foreground font-medium'
                    : 'text-muted-foreground hover:text-foreground border-transparent',
                )}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        <div
          id="procurements-panel"
          role="tabpanel"
          aria-labelledby={`tab-${url.view}`}
          className="flex min-w-0 flex-col gap-4"
        >
          {droppedView ? (
            <DroppedList dropped={dropped} />
          ) : (
            <>
              <ProcurementFilterRow
                values={url}
                onChange={applyFilters}
                agencies={summary?.agencies ?? []}
                budgetYears={(summary?.byYear ?? []).map((entry) => entry.budgetYear)}
              />

              {list.error ? <AdminLoadError error={list.error} onRetry={list.reload} /> : null}

              {list.error && list.items.length === 0 ? null : (
                <div className="bg-card rounded-lg border">
                  {showEmpty ? (
                    <ListEmpty
                      filtered={filtersActive(url)}
                      onClear={() => applyFilters(EMPTY_PROCUREMENT_FILTERS)}
                    />
                  ) : (
                    <ProcurementTable
                      items={list.items}
                      loading={list.loading}
                      selectedId={url.id}
                      onOpen={openRecord}
                      onAction={(record, action) => setActing({ record, action })}
                    />
                  )}
                </div>
              )}

              {list.total > 0 ? (
                <Pagination
                  page={url.page}
                  total={list.total}
                  onPage={(page) => navigate({ ...url, page }, { scroll: true })}
                />
              ) : null}
            </>
          )}
        </div>
      </div>

      <ProcurementDrawer
        open={url.id !== ''}
        record={selected.record}
        error={selected.error}
        now={now}
        onRetry={selected.reload}
        onClose={closeRecord}
        onActionDone={(action) => {
          list.reload();
          selected.reload();
          if (action !== 'approve') closeRecord();
        }}
      />

      {acting ? (
        <ProjectActionDialog
          record={acting.record}
          action={acting.action}
          onClose={() => setActing(null)}
          onDone={list.reload}
        />
      ) : null}
    </AdminPage>
  );
}
