import Link from 'next/link';
import { ExternalLink, ChevronLeft, CalendarDays, Landmark, Layers3 } from 'lucide-react';
import { notFound } from 'next/navigation';
import { formatBudget, formatMatch, formatThaiDate } from '@/lib/formatters';
import { getTor } from '@/features/tors/queries';
import { TorStatusBadge } from '@/components/tors/tor-status-badge';
import { TorSummary } from '@/components/tors/tor-summary';
import { mockTorSummaries } from '@/features/tors/mock-tor-summaries';

export default async function TorDetailPage({ params }: PageProps<'/tors/[id]'>) {
  const { id } = await params;
  const tor = await getTor(id);
  if (!tor) notFound();
  const summary = mockTorSummaries[tor.id];
  return (
    <section className="mx-auto max-w-[1080px]">
      <Link
        href="/search"
        className="inline-flex items-center gap-1 text-sm font-medium text-[#427bd8] transition hover:text-[#245fae]"
      >
        <ChevronLeft className="size-4" /> กลับไปค้นหา
      </Link>
      <div className="mt-5 rounded-xl border border-[#e1e5ed] bg-white p-6 shadow-[0_1px_1px_rgba(31,41,66,0.03)] sm:p-8">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-[#edf4ff] px-2.5 py-1 text-xs font-medium text-[#427bd8]">
            ซอฟต์แวร์
          </span>
          <TorStatusBadge status={tor.status} />
          <span className="rounded-full bg-[#eaf8f3] px-2.5 py-1 text-xs font-medium text-[#29957a]">
            {formatMatch(tor.match?.overallScore)}
          </span>
        </div>
        <h1 className="mt-4 text-3xl font-semibold tracking-[-0.035em] text-[#121b2e] sm:text-4xl">
          {tor.title}
        </h1>
        <p className="mt-3 max-w-3xl text-base leading-7 text-[#5c687b]">{tor.summary}</p>
        <dl className="mt-7 grid gap-5 border-y border-[#e5e8ee] py-6 sm:grid-cols-3">
          <Detail icon={Landmark} label="หน่วยงาน" value={tor.agency} />
          <Detail icon={Layers3} label="งบประมาณ" value={`${formatBudget(tor.budgetThb)} บาท`} />
          <Detail icon={CalendarDays} label="กำหนดส่ง" value={formatThaiDate(tor.deadlineAt)} />
        </dl>
        <div className="mt-6 flex flex-wrap gap-2">
          {tor.techStack.map((technology) => (
            <span
              key={technology}
              className="rounded-full bg-[#f1f4f8] px-3 py-1.5 text-sm font-medium text-[#46546b]"
            >
              {technology}
            </span>
          ))}
        </div>
        <a
          className="mt-8 inline-flex items-center gap-2 rounded-lg bg-[#202b45] px-4 py-2.5 text-sm font-medium text-white transition hover:bg-[#2d3a59] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3974d8] active:translate-y-px"
          href={tor.source.sourceUrl}
          target="_blank"
          rel="noreferrer"
        >
          เปิดประกาศต้นทาง <ExternalLink className="size-4" />
        </a>
      </div>
      {summary && <TorSummary summary={summary} />}
    </section>
  );
}

function Detail({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Landmark;
  label: string;
  value: string;
}) {
  return (
    <div>
      <dt className="flex items-center gap-2 text-sm text-[#738095]">
        <Icon className="size-4" />
        {label}
      </dt>
      <dd className="mt-2 font-semibold text-[#27334a]">{value}</dd>
    </div>
  );
}
