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

/** The header's search field on screens wide enough for it; the narrow case lives in the sheet. */
export function HeaderSearch() {
  const visible = useHeaderSearchVisible();
  if (!visible) return null;

  return (
    <TorSearchField
      size="compact"
      label="ค้นหาประกาศ TOR"
      className="hidden min-w-0 flex-1 md:block md:max-w-sm lg:max-w-md"
    />
  );
}
