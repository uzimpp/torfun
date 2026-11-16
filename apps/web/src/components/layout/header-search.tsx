'use client';

import { usePathname, useSearchParams } from 'next/navigation';

import { TorSearchField } from '@/components/search/tor-search-field';

/**
 * The landing and results pages each own their search field, so the header
 * leaves those pages uncluttered.
 */
const OWNS_ITS_OWN_SEARCH = new Set(['/', '/search']);

export function useHeaderSearchVisible(): boolean {
  return !OWNS_ITS_OWN_SEARCH.has(usePathname());
}

/**
 * The header's search field on screens wide enough for it; the narrow case
 * lives in the sheet. The results page owns its field beside the results.
 *
 * `enabled` is for a page the route table cannot speak for — the 404, which is
 * reached at every URL there is and builds its own search field into the page.
 */
export function HeaderSearch({ enabled = true }: { enabled?: boolean }) {
  const visible = useHeaderSearchVisible();
  if (!enabled || !visible) return null;

  return <HeaderSearchField />;
}

function HeaderSearchField() {
  const searchParams = useSearchParams();

  return (
    <TorSearchField
      size="compact"
      appearance="subtle"
      label="ค้นหาประกาศ TOR"
      defaultValue={searchParams.get('q') ?? ''}
      className="hidden w-full max-w-[28rem] min-w-0 lg:block"
    />
  );
}
