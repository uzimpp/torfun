'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Heart, ArrowUpRight } from 'lucide-react';
import { formatBudget, formatMatch, formatThaiDate } from '@/lib/formatters';
import type { TorWithMatch } from '@/features/tors/types';
import { cn } from '@/lib/utils';
import { TorStatusBadge } from './tor-status-badge';

export function TorCard({ tor }: { tor: TorWithMatch }) {
  const [favorite, setFavorite] = useState(Boolean(tor.isFavorite));
  return (
    <article className="group flex min-h-[244px] flex-col rounded-xl border border-[#e1e5ed] bg-white p-5 shadow-[0_1px_1px_rgba(31,41,66,0.03)] transition duration-200 hover:-translate-y-0.5 hover:border-[#cbd5e3] hover:shadow-[0_10px_22px_rgba(31,41,66,0.08)]">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <span className="rounded-full bg-[#edf4ff] px-2.5 py-1 text-xs font-medium text-[#427bd8]">
            ซอฟต์แวร์
          </span>
          <TorStatusBadge status={tor.status} />
        </div>
        <span className="rounded-full bg-[#eaf8f3] px-2.5 py-1 text-xs font-medium text-[#29957a]">
          {formatMatch(tor.match?.overallScore)}
        </span>
      </div>
      <h3 className="mt-4 text-base leading-snug font-semibold text-[#19243a]">{tor.title}</h3>
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        <div>
          <dt className="text-xs text-[#7c8798]">หน่วยงาน</dt>
          <dd className="mt-0.5 truncate font-medium">{tor.agency}</dd>
        </div>
        <div>
          <dt className="text-xs text-[#7c8798]">แพลตฟอร์ม</dt>
          <dd className="mt-0.5 truncate font-medium">
            {tor.targetPlatforms.includes('mobile') ? 'เว็บและมือถือ' : 'เว็บแอปพลิเคชัน'}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-[#7c8798]">งบประมาณ (บาท)</dt>
          <dd className="mt-0.5 font-medium">{formatBudget(tor.budgetThb)}</dd>
        </div>
        <div>
          <dt className="text-xs text-[#7c8798]">เทคโนโลยี</dt>
          <dd className="mt-0.5 truncate font-medium">{tor.techStack.slice(0, 2).join(', ')}</dd>
        </div>
      </dl>
      <div className="mt-auto flex items-center gap-3 border-t border-[#e5e7eb] pt-3">
        <p className="mr-auto text-xs font-medium text-[#d97735]">
          กำหนดส่ง {formatThaiDate(tor.deadlineAt)}
        </p>
        <button
          type="button"
          onClick={() => setFavorite((current) => !current)}
          aria-label={favorite ? 'นำ TOR ออกจากรายการโปรด' : 'บันทึก TOR'}
          aria-pressed={favorite}
          className={cn(
            'grid size-8 place-items-center rounded-lg transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3974d8] active:translate-y-px',
            favorite ? 'text-[#314563]' : 'text-[#8290a3] hover:bg-[#f1f4f8]',
          )}
        >
          <Heart className="size-5" strokeWidth={1.8} fill={favorite ? 'currentColor' : 'none'} />
        </button>
        <Link
          href={`/tors/${tor.id}`}
          className="inline-flex h-8 items-center gap-1 rounded-lg border border-[#cdd4df] px-2.5 text-sm font-medium text-[#28364e] transition hover:border-[#9eacbf] hover:bg-[#f8fafc] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3974d8] active:translate-y-px"
        >
          ดูรายละเอียด <ArrowUpRight className="size-3.5" />
        </Link>
      </div>
    </article>
  );
}
