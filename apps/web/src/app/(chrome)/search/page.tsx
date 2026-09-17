import type { Metadata } from 'next';

import { SearchExperience } from '@/components/search/search-experience';
import { parseSearchFilters, parseSearchPage } from '@/components/search/search-filter-values';

export const metadata: Metadata = { title: 'ค้นหาประกาศ TOR | Torfun' };

/**
 * The results page, and the destination of every search field on the site.
 *
 * The URL seeds the initial query and filters, so a search can be bookmarked,
 * shared with a colleague, and reached from the header of any page without the
 * fields having to know about each other. `SearchExperience` takes over from
 * there.
 *
 * Not gated. A guest who searches from the landing page arrives here and is
 * told what access the index needs, which is a better answer than a redirect
 * that loses the words they typed.
 */
export default async function SearchPage({ searchParams }: PageProps<'/search'>) {
  const params = await searchParams;
  const filters = parseSearchFilters(params);
  const page = parseSearchPage(params);

  return (
    <main className="page-fill mx-auto w-full max-w-5xl flex-1 px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">ค้นหาประกาศ TOR</h1>
      <p className="text-muted-foreground mt-2 max-w-xl">
        ค้นจากคลังประกาศที่ระบบดึงมา ครอบคลุมงานซอฟต์แวร์แบบ e-bidding ของหน่วยงานภาครัฐ
      </p>

      <SearchExperience initialFilters={filters} initialPage={page} />
    </main>
  );
}
