import type { Metadata } from 'next';

import { SearchExperience } from '@/components/search/search-experience';

export const metadata: Metadata = { title: 'ค้นหาประกาศ TOR | Torfun' };

/**
 * The results page, and the destination of every search field on the site.
 *
 * The URL seeds the initial query, so a search can be bookmarked, shared with
 * a colleague, and reached from the header of any page without the two fields
 * having to know about each other. `SearchExperience` takes over from there.
 *
 * Not gated. A guest who searches from the landing page arrives here and is
 * told what access the index needs, which is a better answer than a redirect
 * that loses the words they typed.
 */
export default async function SearchPage({ searchParams }: PageProps<'/search'>) {
  // `?q=a&q=b` is legal in a URL and arrives as an array; one search box asked
  // one question, so the first value is the one to answer.
  const params = await searchParams;
  const rawQuery = params.q;
  const query = (Array.isArray(rawQuery) ? (rawQuery[0] ?? '') : (rawQuery ?? '')).trim();
  const rawPage = params.page;
  const parsedPage = Number.parseInt(Array.isArray(rawPage) ? (rawPage[0] ?? '') : (rawPage ?? ''), 10);
  const page = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;

  return (
    <main className="page-fill mx-auto w-full max-w-5xl flex-1 px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
      <SearchExperience initialQuery={query} initialPage={page} />
    </main>
  );
}
