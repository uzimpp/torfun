'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { Building2, CircleAlert, FileText, Search, WifiOff } from 'lucide-react';
import type { Procurement } from '@torfun/types';

import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { exampleQueries } from '@/components/layout/nav-config';
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

export function SearchResults({ query }: { query: string }) {
  const { items, total, loading, block, detail } = useTorSearch(query);

  if (!query) return <StartState />;
  if (loading) return <ResultSkeleton />;
  if (block) return <BlockedState block={block} detail={detail} />;
  if (items.length === 0) return <NoMatchState query={query} />;

  return (
    <div>
      <p className="text-muted-foreground text-sm">
        พบ{' '}
        <span data-numeric className="text-foreground font-medium">
          {total.toLocaleString('th-TH')}
        </span>{' '}
        ประกาศ
        {total > items.length && (
          <>
            {' '}
            · แสดง <span data-numeric>{items.length}</span> รายการแรก
          </>
        )}
      </p>

      <ul className="divide-border mt-5 divide-y border-t border-b">
        {items.map((item) => (
          <ResultRow key={item.projectId} item={item} />
        ))}
      </ul>

      {total > RESULT_LIMIT && (
        <p className="text-muted-foreground mt-6 text-sm">
          ปรับคำค้นหาให้เฉพาะเจาะจงขึ้นเพื่อลดจำนวนผลลัพธ์ การแบ่งหน้าอยู่ระหว่างการพัฒนา
        </p>
      )}
    </div>
  );
}

function ResultRow({ item }: { item: Procurement }) {
  return (
    <li className="group hover:bg-card -mx-4 px-4 py-6 transition-colors sm:-mx-6 sm:px-6">
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

      <h3 className="mt-3 text-lg font-medium text-balance">{item.projectName}</h3>

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
          <span className="text-foreground font-medium">สรุปโดย AI · ต้องตรวจสอบต้นฉบับ</span>
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

function StartState() {
  return (
    <StateFrame icon={<Search aria-hidden="true" className="size-5" />} title="เริ่มค้นหาประกาศ">
      <p>
        พิมพ์ชื่อระบบ ชื่อหน่วยงาน หรือคำสำคัญจากประกาศ เช่น{' '}
        {exampleQueries.map((example, index) => (
          <span key={example}>
            {index > 0 && ' · '}
            <span className="text-foreground">{example}</span>
          </span>
        ))}
      </p>
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
        ไม่มีประกาศที่ตรงกับ <span className="text-foreground">{query}</span> ในคลังข้อมูลขณะนี้
        ลองใช้คำที่กว้างขึ้น หรือค้นด้วยชื่อหน่วยงานแทน
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
        <p>
          ขณะนี้คลังประกาศที่ระบบดึงมาเปิดให้เฉพาะผู้ดูแลระบบ
          การเปิดให้เจ้าหน้าที่พัฒนาธุรกิจค้นหาได้เองอยู่ระหว่างการพัฒนา
        </p>
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
