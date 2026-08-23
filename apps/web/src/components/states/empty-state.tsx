import Link from 'next/link';
import { SearchX } from 'lucide-react';

export function EmptyState({
  title,
  description,
  actionHref = '/search',
  actionLabel = 'ไปหน้าค้นหา',
}: {
  title: string;
  description: string;
  actionHref?: string;
  actionLabel?: string;
}) {
  return (
    <div className="grid min-h-[300px] place-items-center rounded-xl border border-dashed border-[#cbd5e1] bg-white p-8 text-center">
      <div>
        <span className="mx-auto grid size-12 place-items-center rounded-xl bg-[#edf1f8] text-[#506079]">
          <SearchX className="size-6" />
        </span>
        <h2 className="mt-4 text-lg font-semibold">{title}</h2>
        <p className="mt-1 max-w-sm text-sm text-[#68758a]">{description}</p>
        <Link
          className="mt-5 inline-flex rounded-lg bg-[#202b45] px-3 py-2 text-sm font-medium text-white transition hover:bg-[#2d3a59] active:translate-y-px"
          href={actionHref}
        >
          {actionLabel}
        </Link>
      </div>
    </div>
  );
}
