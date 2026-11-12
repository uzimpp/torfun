'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

import { ProcurementFilters } from './procurement-filters';
import { ScrollButtons } from './scroll-buttons';
import { TorSearchField } from './tor-search-field';
import {
  parseSearchFilters,
  parseSearchPage,
  searchHref,
  type SearchFilterValues,
} from './search-filter-values';
import { RESULT_ROW_SELECTOR, SearchResults } from './search-results';

const DEBOUNCE_MS = 350;

function readSearchUrl(): { filters: SearchFilterValues; page: number } {
  const params = new URLSearchParams(window.location.search);
  const raw = Object.fromEntries(params.entries());
  return { filters: parseSearchFilters(raw), page: parseSearchPage(raw) };
}

/**
 * The field and its results on `/search`.
 *
 * Typing searches live: `query` (what actually gets searched) trails `value`
 * (what's on screen) by `DEBOUNCE_MS`, so a fast typist doesn't fire one
 * request per keystroke. Pressing Enter skips the wait; this page hides the
 * submit button and doesn't provide suggestion chips. A new search always
 * starts back at page 1.
 *
 * Typing updates the address bar via a raw `history.replaceState`: the
 * router's `replace` would re-run the server component on every keystroke,
 * wasted work since the query already lives in this component's state.
 * Changing page instead uses `pushState`, a real back-button entry — moving
 * between pages of the same search, unlike each keystroke, is exactly the
 * kind of step a reader expects Back to undo. Bypassing the router for both
 * means bypassing its Back/Forward handling too, so a `popstate` listener
 * re-reads the URL and restores state itself.
 */
export function SearchExperience({
  initialFilters,
  initialPage,
}: {
  initialFilters: SearchFilterValues;
  initialPage: number;
}) {
  const initialKey = searchHref(initialFilters, initialPage);
  const [serverKey, setServerKey] = useState(initialKey);
  const [baseFilters, setBaseFilters] = useState(initialFilters);
  const [value, setValue] = useState(initialFilters.query);
  const [query, setQuery] = useState(initialFilters.query);
  const [page, setPage] = useState(initialPage);
  const [queryForPage, setQueryForPage] = useState(initialFilters.query);
  const [filterPanelVersion, setFilterPanelVersion] = useState(0);
  const resultsRef = useRef<HTMLElement>(null);

  // Filter forms and clear links navigate through Next.js. The client boundary
  // can survive that navigation, so sync its state when the server sends a new
  // URL rather than keying/remounting the search field (which previously left
  // a duplicate search box in the document).
  if (initialKey !== serverKey) {
    setServerKey(initialKey);
    setBaseFilters(initialFilters);
    setValue(initialFilters.query);
    setQuery(initialFilters.query);
    setQueryForPage(initialFilters.query);
    setPage(initialPage);
  }

  // A new search starts back at page 1. Adjusted here, during render, rather
  // than in an effect, so the reset lands in the same commit as the query
  // change instead of the old page briefly showing results for the new query.
  if (query !== queryForPage) {
    setQueryForPage(query);
    setPage(1);
  }

  const filters = useMemo(() => ({ ...baseFilters, query }), [baseFilters, query]);

  useEffect(() => {
    const trimmed = value.trim();
    if (trimmed === query) return;
    const timer = setTimeout(() => setQuery(trimmed), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [value, query]);

  useEffect(() => {
    window.history.replaceState(null, '', searchHref(filters, page));
  }, [filters, page]);

  useEffect(() => {
    function onPopState() {
      const restored = readSearchUrl();
      setFilterPanelVersion((version) => version + 1);
      setBaseFilters(restored.filters);
      setValue(restored.filters.query);
      setQuery(restored.filters.query);
      setQueryForPage(restored.filters.query);
      setPage(restored.page);
    }
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  function applyFilters(nextFilters: SearchFilterValues) {
    const filtersWithOrder = { ...nextFilters, order: filters.order };
    window.history.pushState(null, '', searchHref(filtersWithOrder));
    setBaseFilters(filtersWithOrder);
    setValue(filtersWithOrder.query);
    setQuery(filtersWithOrder.query);
    setPage(1);
    if (window.matchMedia('(max-width: 1023px)').matches) {
      window.requestAnimationFrame(() =>
        resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
      );
    }
  }

  function goToPage(nextPage: number) {
    window.history.pushState(null, '', searchHref(filters, nextPage));
    setPage(nextPage);
    // Pagination sits at both the top and bottom of a long list — clicking
    // the bottom control shouldn't leave the reader staring at whatever
    // happens to be at their current scroll offset in the new page.
    resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function changeOrder(order: SearchFilterValues['order']) {
    const nextFilters = { ...filters, order };
    window.history.pushState(null, '', searchHref(nextFilters));
    setBaseFilters({ ...baseFilters, order });
    setPage(1);
  }

  return (
    <>
      <div className="grid items-start gap-6 lg:grid-cols-[19rem_minmax(0,1fr)] lg:gap-10">
        <ProcurementFilters
          key={`${serverKey}::${filterPanelVersion}`}
          values={filters}
          onApply={applyFilters}
        />
        <section ref={resultsRef} aria-label="ผลการค้นหา" className="min-w-0 scroll-mt-24">
          <h1 className="sr-only">ค้นหาประกาศ TOR</h1>
          <TorSearchField
            size="compact"
            value={value}
            onValueChange={setValue}
            onSubmit={(nextQuery) => applyFilters({ ...filters, query: nextQuery })}
            showSubmitButton={false}
            className="mb-4 w-full"
          />
          <SearchResults
            key={`${searchHref(filters)}::${page}`}
            filters={filters}
            page={page}
            onOrderChange={changeOrder}
            onPageChange={goToPage}
          />
        </section>
      </div>

      <ScrollButtons lastItemSelector={RESULT_ROW_SELECTOR} />
    </>
  );
}
