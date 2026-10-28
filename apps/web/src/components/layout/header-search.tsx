'use client';

import { usePathname } from 'next/navigation';

import { TorSearchField } from '@/components/search/tor-search-field';

/**
 * The landing page builds its hero around a search field, so the header leaves
 * that one uncluttered. The results page also keeps its field in the header for
 * quick follow-up searches while browsing.
 */
const OWNS_ITS_OWN_SEARCH = new Set(['/']);

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
