import {
  IngestionOutcome,
  IngestionState,
  ProcurementStatus,
  type ProcurementFilters,
} from '@torfun/types';

export const PROCUREMENT_PAGE_SIZE = 25;

export type ProcurementView = 'all' | 'dropped';

/** The list's filters as the URL and the form hold them; empty means "no filter". */
export interface ProcurementListFilters {
  q: string;
  state: IngestionState | '';
  outcome: IngestionOutcome | '';
  status: ProcurementStatus | '';
  agency: string;
  /** Buddhist-era budget year, digits only. */
  year: string;
}

/** Everything `/admin/procurements` keeps in its URL. */
export interface ProcurementUrlState extends ProcurementListFilters {
  /** 1-based. */
  page: number;
  view: ProcurementView;
  /** The record open in the drawer; empty when none is. */
  id: string;
}

export const EMPTY_PROCUREMENT_FILTERS: ProcurementListFilters = {
  q: '',
  state: '',
  outcome: '',
  status: '',
  agency: '',
  year: '',
};

export const EMPTY_PROCUREMENT_URL: ProcurementUrlState = {
  ...EMPTY_PROCUREMENT_FILTERS,
  page: 1,
  view: 'all',
  id: '',
};

type RawSearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? '';
}

function oneOf<T extends string>(options: readonly T[], value: string): T | '' {
  return options.includes(value as T) ? (value as T) : '';
}

/**
 * Unknown values are dropped rather than passed on: the API answers a bad enum
 * with a 400, and a stale bookmark should still open the list.
 */
export function parseProcurementFilters(params: RawSearchParams): ProcurementUrlState {
  const page = Number(first(params.page));
  const year = first(params.year).trim();

  return {
    q: first(params.q).trim(),
    state: oneOf(IngestionState.options, first(params.state)),
    outcome: oneOf(IngestionOutcome.options, first(params.outcome)),
    status: oneOf(ProcurementStatus.options, first(params.status)),
    agency: first(params.agency).trim(),
    year: /^\d{4}$/.test(year) ? year : '',
    page: Number.isInteger(page) && page > 0 ? page : 1,
    view: first(params.view) === 'dropped' ? 'dropped' : 'all',
    id: first(params.id).trim(),
  };
}

export function procurementsHref(state: Partial<ProcurementUrlState> = {}): string {
  const {
    q,
    state: ingestionState,
    outcome,
    status,
    agency,
    year,
    view,
    page,
    id,
  } = {
    ...EMPTY_PROCUREMENT_URL,
    ...state,
  };
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  if (ingestionState) params.set('state', ingestionState);
  if (outcome) params.set('outcome', outcome);
  if (status) params.set('status', status);
  if (agency) params.set('agency', agency);
  if (year) params.set('year', year);
  if (view !== 'all') params.set('view', view);
  if (page > 1) params.set('page', String(page));
  if (id) params.set('id', id);
  const query = params.toString();
  return `/admin/procurements${query ? `?${query}` : ''}`;
}

/** A filter change: page 4 of the old result is rarely page 4 of the new one. */
export function withFilters(
  current: ProcurementUrlState,
  patch: Partial<ProcurementListFilters>,
): ProcurementUrlState {
  return { ...current, ...patch, page: 1 };
}

export function toProjectQuery(filters: ProcurementListFilters, page: number): ProcurementFilters {
  return {
    limit: PROCUREMENT_PAGE_SIZE,
    offset: (Math.max(1, page) - 1) * PROCUREMENT_PAGE_SIZE,
    ...(filters.q ? { q: filters.q } : {}),
    ...(filters.state ? { state: filters.state } : {}),
    ...(filters.outcome ? { outcome: filters.outcome } : {}),
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.agency ? { deptName: filters.agency } : {}),
    ...(filters.year ? { budgetYear: Number(filters.year) } : {}),
  };
}
