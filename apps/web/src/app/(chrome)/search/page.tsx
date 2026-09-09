import type { Metadata } from 'next';

import { getCurrentUser } from '@/lib/auth';
import { SiteFooter } from '@/components/layout/site-footer';
import { TorSearchField } from '@/components/search/tor-search-field';
import { SearchResults } from '@/components/search/search-results';
import { exampleQueries } from '@/components/layout/nav-config';

export const metadata: Metadata = { title: 'ค้นหาประกาศ TOR | Torfun' };

/**
 * The results page, and the destination of every search field on the site.
 *
 * The query lives in the URL rather than in component state, so a search can be
 * bookmarked, shared with a colleague, and reached from the header of any page
 * without the two fields having to know about each other.
 *
 * Not gated. A guest who searches from the landing page arrives here and is
 * told what access the index needs, which is a better answer than a redirect
 * that loses the words they typed.
 */
export default async function SearchPage({ searchParams }: PageProps<'/search'>) {
  // `?q=a&q=b` is legal in a URL and arrives as an array; one search box asked
  // one question, so the first value is the one to answer.
  const raw = (await searchParams).q;
  const query = (Array.isArray(raw) ? (raw[0] ?? '') : (raw ?? '')).trim();
  const signedIn = (await getCurrentUser()) !== null;

  return (
    <>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">ค้นหาประกาศ TOR</h1>
        <p className="text-muted-foreground mt-2 max-w-xl">
          ค้นจากคลังประกาศที่ระบบดึงมา ครอบคลุมงานซอฟต์แวร์แบบ e-bidding ในกรุงเทพมหานคร
        </p>

        {/* `key` reruns the field's own state from the URL: following a
            suggestion or a browser Back must change what the box says. */}
        <TorSearchField
          key={query}
          size="hero"
          defaultValue={query}
          autoFocus={query === ''}
          suggestions={query === '' ? exampleQueries : undefined}
          className="mt-8"
        />

        <section aria-label="ผลการค้นหา" className="mt-10">
          <SearchResults query={query} />
        </section>
      </main>
      <SiteFooter signedIn={signedIn} />
    </>
  );
}
