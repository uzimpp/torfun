'use client';

import { useEffect, useRef, useState } from 'react';

import { exampleQueries } from '@/components/layout/nav-config';
import { ScrollButtons } from './scroll-buttons';
import { RESULT_ROW_SELECTOR, SearchResults } from './search-results';
import { TorSearchField } from './tor-search-field';

const DEBOUNCE_MS = 350;

function readSearchUrl(): { query: string; page: number } {
  const params = new URLSearchParams(window.location.search);
  const page = Math.max(1, Math.trunc(Number(params.get('page'))) || 1);
  return { query: (params.get('q') ?? '').trim(), page };
}

function buildSearchUrl(query: string, page: number): string {
  const params = new URLSearchParams();
  if (query) params.set('q', query);
  if (page > 1) params.set('page', String(page));
  const qs = params.toString();
  return qs ? `/search?${qs}` : '/search';
}

/**
 * The field and its results on `/search`.
 *
 * Typing searches live: `query` (what actually gets searched) trails `value`
 * (what's on screen) by `DEBOUNCE_MS`, so a fast typist doesn't fire one
 * request per keystroke. Submitting — Enter, the button, or a suggestion chip
 * — skips the wait. A new search always starts back at page 1.
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
  initialQuery,
  initialPage,
}: {
  initialQuery: string;
  initialPage: number;
}) {
  const [value, setValue] = useState(initialQuery);
  const [query, setQuery] = useState(initialQuery);
  const [page, setPage] = useState(initialPage);
  const resultsRef = useRef<HTMLElement>(null);

  // A new search starts back at page 1. Adjusted here, during render, rather
  // than in an effect, so the reset lands in the same commit as the query
  // change instead of the old page briefly showing results for the new query.
  const [queryForPage, setQueryForPage] = useState(query);
  if (query !== queryForPage) {
    setQueryForPage(query);
    setPage(1);
  }

  useEffect(() => {
    const trimmed = value.trim();
    if (trimmed === query) return;
    const timer = setTimeout(() => setQuery(trimmed), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [value, query]);

  useEffect(() => {
    window.history.replaceState(null, '', buildSearchUrl(query, page));
  }, [query, page]);

  useEffect(() => {
    function onPopState() {
      const restored = readSearchUrl();
      setValue(restored.query);
      setQuery(restored.query);
      setQueryForPage(restored.query);
      setPage(restored.page);
    }
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  function goToPage(nextPage: number) {
    window.history.pushState(null, '', buildSearchUrl(query, nextPage));
    setPage(nextPage);
    // Pagination sits at both the top and bottom of a long list — clicking
    // the bottom control shouldn't leave the reader staring at whatever
    // happens to be at their current scroll offset in the new page.
    resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  return (
    <>
      <TorSearchField
        size="hero"
        value={value}
        onValueChange={setValue}
        onSubmit={setQuery}
        autoFocus={initialQuery === ''}
        suggestions={value === '' ? exampleQueries : undefined}
        className="mt-0"
      />

      <section ref={resultsRef} aria-label="ผลการค้นหา" className="mt-10 scroll-mt-20">
        {/* Keyed on query+page: each combination is a fresh instance of the
            results hook, not a retarget of the old one — see use-tor-search.ts. */}
        <SearchResults
          key={`${query}::${page}`}
          query={query}
          page={page}
          onPageChange={goToPage}
        />
      </section>

      <ScrollButtons lastItemSelector={RESULT_ROW_SELECTOR} />
    </>
  );
}
