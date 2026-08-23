import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { TorGrid } from '@/components/tors/tor-grid';
import { getRecommendedTors } from '../queries';

export async function HomePage() {
  const tors = await getRecommendedTors(5);
  return (
    <section className="mx-auto max-w-[1320px]">
      <h1 className="text-3xl font-semibold tracking-[-0.035em] text-[#121b2e] sm:text-4xl">
        หน้าหลัก
      </h1>
      <div className="mt-8 flex items-center justify-between gap-4">
        <h2 className="text-xl font-semibold">TOR แนะนำ</h2>
        <Link
          href="/search"
          className="inline-flex items-center gap-1 text-sm font-medium text-[#427bd8] transition hover:text-[#245fae] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3974d8]"
        >
          ดู TOR ทั้งหมด <ArrowRight className="size-4" />
        </Link>
      </div>
      <div className="mt-4">
        <TorGrid tors={tors} />
      </div>
    </section>
  );
}
