'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import {
  Building2,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  FileText,
  Search,
  WifiOff,
} from 'lucide-react';
import type { Procurement } from '@torfun/types';

import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { hasSearchCriteria, type SearchFilterValues } from './search-filter-values';
import { RESULT_LIMIT, useTorSearch, type SearchBlock } from './use-tor-search';

const CLASS_LABELS: Record<Procurement['softwareClass'], string> = {
  new_build: 'พัฒนาระบบใหม่',
  oandm: 'ดูแลและบำรุงรักษา',
  not_software: 'ไม่ใช่งานซอฟต์แวร์',
};

const bahtFormat = new Intl.NumberFormat('th-TH', {
  style: 'currency',
  currency: 'THB',
  maximumFractionDigits: 0,
});

export function SearchResults({
  filters,
  page,
  onPageChange,
}: {
  filters: SearchFilterValues;
  /** 1-indexed, matching what shows in the URL and in "หน้า X จาก Y". */
  page: number;
  onPageChange: (page: number) => void;
}) {
  const { items, total, loading, block, detail } = useTorSearch(filters, page);

  if (loading) return <ResultSkeleton />;
  if (block) return <BlockedState block={block} detail={detail} />;
  if (items.length === 0) {
    return hasSearchCriteria(filters) ? (
      <NoMatchState query={filters.query} />
    ) : (
      <EmptyIndexState />
    );
  }

  const first = (page - 1) * RESULT_LIMIT + 1;
  const last = first + items.length - 1;
  const pageCount = Math.max(1, Math.ceil(total / RESULT_LIMIT));

  return (
    <div>
      <p className="text-muted-foreground text-sm">
        พบทั้งหมด{' '}
        <span data-numeric className="text-foreground font-medium">
          {total.toLocaleString('th-TH')}
        </span>{' '}
        ประกาศ · แสดง <span data-numeric>{first.toLocaleString('th-TH')}</span>–
        <span data-numeric>{last.toLocaleString('th-TH')}</span>
      </p>

      <ul className="divide-border mt-5 divide-y border-t border-b">
        {items.map((item) => (
          <ResultRow key={item.projectId} item={item} />
        ))}
      </ul>

      {pageCount > 1 && (
        <div className="mt-8 flex justify-center">
          <SearchPagination page={page} pageCount={pageCount} onPageChange={onPageChange} />
        </div>
      )}
    </div>
  );
}

const PAGE_WINDOW = 5;

type PaginationItem = number | 'ellipsis';

/**
 * Page 1, the last page, and up to `PAGE_WINDOW` pages around the current one
 * — with an ellipsis standing in for whatever that leaves out. A gap of
 * exactly one page is filled in rather than collapsed: an ellipsis hiding a
 * single page reads as noise, not a shortcut.
 */
function paginationItems(page: number, pageCount: number): PaginationItem[] {
  const size = Math.min(PAGE_WINDOW, pageCount);
  const start = Math.max(1, Math.min(page - Math.floor(size / 2), pageCount - size + 1));
  const end = start + size - 1;

  const items: PaginationItem[] = [];
  if (start > 1) {
    items.push(1);
    if (start > 2) items.push('ellipsis');
  }
  for (let p = start; p <= end; p++) items.push(p);
  if (end < pageCount) {
    if (end < pageCount - 1) items.push('ellipsis');
    items.push(pageCount);
  }
  return items;
}

function SearchPagination({
  page,
  pageCount,
  onPageChange,
}: {
  page: number;
  pageCount: number;
  onPageChange: (page: number) => void;
}) {
  return (
    <nav aria-label="หน้าผลการค้นหา">
      <div className="bg-card border-border inline-flex items-center gap-1 rounded-full border p-1.5">
        <button
          type="button"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          className="text-muted-foreground hover:bg-muted hover:text-foreground flex h-9 items-center gap-1 rounded-full px-3 text-sm font-medium transition-colors disabled:opacity-40 disabled:hover:bg-transparent"
        >
          <ChevronLeft aria-hidden="true" className="size-4" />
          <span className="hidden sm:inline">ก่อนหน้า</span>
        </button>

        {paginationItems(page, pageCount).map((item, index) =>
          item === 'ellipsis' ? (
            <span
              key={`ellipsis-${index}`}
              aria-hidden="true"
              className="text-muted-foreground/70 grid size-9 place-items-center text-sm"
            >
              …
            </span>
          ) : (
            <button
              key={item}
              type="button"
              onClick={() => onPageChange(item)}
              aria-current={item === page ? 'page' : undefined}
              className={cn(
                'grid size-9 place-items-center rounded-full text-sm font-medium transition-colors',
                item === page
                  ? 'bg-primary text-primary-foreground font-semibold'
                  : 'text-foreground hover:bg-muted',
              )}
            >
              {item}
            </button>
          ),
        )}

        <button
          type="button"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= pageCount}
          className="text-muted-foreground hover:bg-muted hover:text-foreground flex h-9 items-center gap-1 rounded-full px-3 text-sm font-medium transition-colors disabled:opacity-40 disabled:hover:bg-transparent"
        >
          <span className="hidden sm:inline">ถัดไป</span>
          <ChevronRight aria-hidden="true" className="size-4" />
        </button>
      </div>
    </nav>
  );
}

/** Selector for the last-rendered row — what "scroll to bottom" jumps to, not the page's actual end. */
export const RESULT_ROW_SELECTOR = '[data-result-row]';

function ResultRow({ item }: { item: Procurement }) {
  return (
    <li
      data-result-row
      className="group hover:bg-card -mx-4 px-4 py-6 transition-colors sm:-mx-6 sm:px-6"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="bg-primary/10 text-primary rounded-full px-2.5 py-1 text-xs font-medium">
          {CLASS_LABELS[item.softwareClass]}
        </span>
        {item.eBidding && (
          <span className="text-muted-foreground border-border rounded-full border px-2.5 py-1 text-xs">
            e-bidding
          </span>
        )}
        <span data-numeric className="text-muted-foreground font-mono text-xs">
          ปีงบประมาณ {item.year}
        </span>
      </div>

      <h3 className="mt-3 text-lg font-medium text-balance">
        <Link
          href={`/tor/${encodeURIComponent(item.projectId)}`}
          className="hover:text-primary transition-colors"
        >
          {item.projectName}
        </Link>
      </h3>

      <div className="text-muted-foreground mt-3 flex flex-wrap gap-x-6 gap-y-1.5 text-sm">
        <span className="inline-flex items-start gap-2">
          <Building2 aria-hidden="true" className="mt-1 size-3.5 shrink-0" />
          {item.deptSubName ?? item.deptName}
        </span>
        {item.projectMoney !== null && (
          <span data-numeric className="font-mono">
            งบประมาณ {bahtFormat.format(item.projectMoney)}
          </span>
        )}
      </div>

      {/* What Gemini read is offered as a reading aid and labelled as one. The
          announcement itself remains the thing an officer bids against. */}
      {item.analysis ? (
        <p className="text-muted-foreground border-primary/30 mt-4 border-s-2 ps-4 text-sm">
          <span className="text-foreground font-medium">สรุปโดย AI</span>
          <br />
          {item.analysis.summary}
        </p>
      ) : (
        <p className="text-muted-foreground mt-4 inline-flex items-center gap-2 text-sm">
          <FileText aria-hidden="true" className="size-3.5" />
          ยังไม่มีบทสรุปจากเอกสาร TOR สำหรับประกาศนี้
        </p>
      )}
    </li>
  );
}

/* -------------------------------------------------------------------------- *
 * The states that are not a list of results. Each one says what happened and
 * what the reader can do about it; none of them is a bare empty page.
 * -------------------------------------------------------------------------- */

function StateFrame({
  icon,
  title,
  children,
}: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="border-border rounded-3xl border border-dashed px-6 py-14 text-center">
      <span className="bg-muted text-muted-foreground mx-auto grid size-12 place-items-center rounded-2xl">
        {icon}
      </span>
      <h2 className="mt-5 text-xl font-medium">{title}</h2>
      <div className="text-muted-foreground mx-auto mt-3 max-w-md text-sm">{children}</div>
    </div>
  );
}

function EmptyIndexState() {
  return (
    <StateFrame
      icon={<Search aria-hidden="true" className="size-5" />}
      title="ยังไม่มีประกาศในคลังข้อมูล"
    >
      <p>ระบบยังไม่ได้ดึงประกาศเข้ามา หรือคลังข้อมูลว่างเปล่าในขณะนี้</p>
    </StateFrame>
  );
}

function NoMatchState({ query }: { query: string }) {
  return (
    <StateFrame
      icon={<Search aria-hidden="true" className="size-5" />}
      title="ไม่พบประกาศที่ตรงกับคำค้นหา"
    >
      <p>
        ไม่มีประกาศที่ตรงกับ
        {query ? (
          <>
            {' '}
            <span className="text-foreground">{query}</span>
          </>
        ) : (
          ' ตัวกรองที่เลือก'
        )}{' '}
        ในคลังข้อมูลขณะนี้ ลองลดตัวกรองหรือใช้คำที่กว้างขึ้น
      </p>
      <p className="mt-3">
        คลังข้อมูลครอบคลุมงานซอฟต์แวร์แบบ e-bidding ของหน่วยงานภาครัฐ
        ประกาศนอกขอบเขตนี้จะไม่ปรากฏในผลการค้นหา
      </p>
    </StateFrame>
  );
}

function BlockedState({ block, detail }: { block: SearchBlock; detail: string | null }) {
  if (block === 'signed_out') {
    return (
      <StateFrame
        icon={<Search aria-hidden="true" className="size-5" />}
        title="เข้าสู่ระบบเพื่อค้นหาประกาศ"
      >
        <p>คลังประกาศเปิดให้ผู้ใช้ที่เข้าสู่ระบบแล้ว สร้างบัญชีหรือเข้าสู่ระบบเพื่อค้นหาต่อ</p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link href="/login" className={cn(buttonVariants(), 'min-h-11 rounded-xl px-5')}>
            เข้าสู่ระบบ
          </Link>
          <Link
            href="/register"
            className={cn(buttonVariants({ variant: 'outline' }), 'min-h-11 rounded-xl px-5')}
          >
            สร้างบัญชีผู้ใช้
          </Link>
        </div>
      </StateFrame>
    );
  }

  if (block === 'no_access') {
    return (
      <StateFrame
        icon={<CircleAlert aria-hidden="true" className="size-5" />}
        title="บัญชีนี้ยังเข้าถึงคลังประกาศไม่ได้"
      >
        <p>บัญชีที่เข้าสู่ระบบไม่มีสิทธิ์อ่านคลังประกาศ กรุณาติดต่อผู้ดูแลระบบเพื่อตรวจสอบบัญชี</p>
      </StateFrame>
    );
  }

  if (block === 'unreachable') {
    return (
      <StateFrame
        icon={<WifiOff aria-hidden="true" className="size-5" />}
        title="ติดต่อเซิร์ฟเวอร์ไม่ได้"
      >
        <p>ระบบค้นหาไม่สามารถเชื่อมต่อกับ API ได้ ลองใหม่อีกครั้งหรือแจ้งผู้ดูแลระบบ</p>
        {detail && <p className="text-muted-foreground/80 mt-3 font-mono text-xs">{detail}</p>}
      </StateFrame>
    );
  }

  return (
    <StateFrame icon={<CircleAlert aria-hidden="true" className="size-5" />} title="ค้นหาไม่สำเร็จ">
      <p>เกิดข้อผิดพลาดระหว่างค้นหา ลองใหม่อีกครั้ง</p>
      {detail && <p className="text-muted-foreground/80 mt-3 font-mono text-xs">{detail}</p>}
    </StateFrame>
  );
}

/** Placeholders shaped like the rows they stand in for, not a spinner. */
function ResultSkeleton() {
  return (
    <div aria-busy="true" aria-live="polite">
      <span className="sr-only">กำลังค้นหา</span>
      <div className="bg-muted h-4 w-40 animate-pulse rounded" />
      <ul className="divide-border mt-5 divide-y border-t border-b">
        {[0, 1, 2, 3].map((row) => (
          <li key={row} className="space-y-3 py-6">
            <div className="bg-muted h-5 w-24 animate-pulse rounded-full" />
            <div className="bg-muted h-6 w-full max-w-2xl animate-pulse rounded" />
            <div className="bg-muted h-4 w-64 animate-pulse rounded" />
          </li>
        ))}
      </ul>
    </div>
  );
}
