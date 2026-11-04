'use client';

import { usePathname } from 'next/navigation';

import { TorSearchField } from '@/components/search/tor-search-field';

/**
 * Routes that already put a search field in front of the reader: the landing
 * page builds its hero around one, and the results page keeps its own at the
 * top so the query stays editable next to what it returned. Repeating the
 * field in the header on either would give the page two of them.
 */
const OWNS_ITS_OWN_SEARCH = new Set(['/', '/search']);

export function useHeaderSearchVisible(): boolean {
  return !OWNS_ITS_OWN_SEARCH.has(usePathname());
}

/**
 * The header's search field on screens wide enough for it; the narrow case
 * lives in the sheet.
 *
 * `enabled` is for a page the route table cannot speak for — the 404, which is
 * reached at every URL there is and builds its own search field into the page.
 */
export function HeaderSearch({ enabled = true }: { enabled?: boolean }) {
  const visible = useHeaderSearchVisible();
  if (!enabled || !visible) return null;

  return (
    <TorSearchField
      size="compact"
      label="ค้นหาประกาศ TOR"
      className="hidden w-full max-w-xs min-w-0 md:block lg:max-w-sm"
    />
  );
}
