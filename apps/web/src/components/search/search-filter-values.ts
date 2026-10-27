import { ProcurementStatus, type ProcurementFilters, type TargetPlatform } from '@torfun/types';

export interface SearchFilterValues {
  query: string;
  status: ProcurementStatus | '';
  eBidding: '' | 'true' | 'false';
  minDaysLeft: string;
  deptName: string;
  year: string;
  outcome: '' | 'tor_analysed';
  minBudget: string;
  maxBudget: string;
  publishedFrom: string;
  publishedTo: string;
  deadlineFrom: string;
  deadlineTo: string;
  techStack: string;
  targetPlatforms: TargetPlatform[];
  industry: string;
}

export const EMPTY_SEARCH_FILTERS: SearchFilterValues = {
  query: '',
  status: '',
  eBidding: '',
  minDaysLeft: '',
  deptName: '',
  year: '',
  outcome: '',
  minBudget: '',
  maxBudget: '',
  publishedFrom: '',
  publishedTo: '',
  deadlineFrom: '',
  deadlineTo: '',
  techStack: '',
  targetPlatforms: [],
  industry: '',
};

type RawSearchParams = Record<string, string | string[] | undefined>;

const PLATFORM_VALUES: TargetPlatform[] = ['macos', 'windows', 'mobile', 'web_app', 'other'];

function first(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? '';
}

export function parseSearchFilters(params: RawSearchParams): SearchFilterValues {
  const platforms = (
    Array.isArray(params.targetPlatforms)
      ? params.targetPlatforms
      : first(params.targetPlatforms).split(',')
  ).filter((value): value is TargetPlatform => PLATFORM_VALUES.includes(value as TargetPlatform));

  return {
    query: first(params.q).trim(),
    status: ProcurementStatus.safeParse(first(params.status)).data ?? '',
    eBidding:
      first(params.eBidding) === 'true'
        ? 'true'
        : first(params.eBidding) === 'false'
          ? 'false'
          : '',
    minDaysLeft: first(params.minDaysLeft),
    deptName: first(params.deptName),
    year: first(params.year),
    outcome: first(params.outcome) === 'tor_analysed' ? 'tor_analysed' : '',
    minBudget: first(params.minBudget),
    maxBudget: first(params.maxBudget),
    publishedFrom: first(params.publishedFrom),
    publishedTo: first(params.publishedTo),
    deadlineFrom: first(params.deadlineFrom),
    deadlineTo: first(params.deadlineTo),
    techStack: first(params.techStack),
    targetPlatforms: [...new Set(platforms)],
    industry: first(params.industry),
  };
}

export function parseSearchPage(params: RawSearchParams): number {
  const page = Number(first(params.page));
  return Number.isInteger(page) && page > 0 ? page : 1;
}

export function activeFilterCount(values: SearchFilterValues): number {
  return [
    values.status,
    values.eBidding,
    values.deptName,
    values.year,
    values.outcome,
    values.minBudget || values.maxBudget,
    values.publishedFrom || values.publishedTo,
    values.minDaysLeft || values.deadlineFrom || values.deadlineTo,
    values.techStack,
    values.targetPlatforms.length > 0,
    values.industry,
  ].filter(Boolean).length;
}

export function hasSearchCriteria(values: SearchFilterValues): boolean {
  return values.query !== '' || activeFilterCount(values) > 0;
}

export function toProjectFilters(
  values: SearchFilterValues,
  limit: number,
  offset: number,
): ProcurementFilters {
  const number = (value: string) => (value === '' ? undefined : Number(value));
  const terms = values.techStack
    .split(',')
    .map((term) => term.trim())
    .filter(Boolean);

  return {
    limit,
    offset,
    ...(values.status ? { status: values.status } : {}),
    ...(values.eBidding ? { eBidding: values.eBidding === 'true' } : {}),
    ...(values.deptName ? { deptName: values.deptName } : {}),
    ...(values.year ? { year: Number(values.year) } : {}),
    ...(values.outcome ? { outcome: values.outcome } : {}),
    ...(values.minDaysLeft !== '' ? { minDaysLeft: Number(values.minDaysLeft) } : {}),
    ...(values.query ? { q: values.query } : {}),
    ...(values.minBudget ? { minBudget: number(values.minBudget) } : {}),
    ...(values.maxBudget ? { maxBudget: number(values.maxBudget) } : {}),
    ...(values.publishedFrom ? { publishedFrom: values.publishedFrom } : {}),
    ...(values.publishedTo ? { publishedTo: values.publishedTo } : {}),
    ...(values.minDaysLeft === '' && values.deadlineFrom
      ? { deadlineFrom: values.deadlineFrom }
      : {}),
    ...(values.minDaysLeft === '' && values.deadlineTo ? { deadlineTo: values.deadlineTo } : {}),
    ...(terms.length > 0 ? { techStack: terms } : {}),
    ...(values.targetPlatforms.length > 0 ? { targetPlatforms: values.targetPlatforms } : {}),
    ...(values.industry ? { industry: values.industry } : {}),
  };
}

export function searchHref(values: SearchFilterValues, page = 1): string {
  const params = new URLSearchParams();
  if (values.status) params.set('status', values.status);
  if (values.eBidding) params.set('eBidding', values.eBidding);
  if (values.deptName) params.set('deptName', values.deptName);
  if (values.year) params.set('year', values.year);
  if (values.outcome) params.set('outcome', values.outcome);
  if (values.minDaysLeft !== '') params.set('minDaysLeft', values.minDaysLeft);
  if (values.query) params.set('q', values.query);
  if (values.minBudget) params.set('minBudget', values.minBudget);
  if (values.maxBudget) params.set('maxBudget', values.maxBudget);
  if (values.publishedFrom) params.set('publishedFrom', values.publishedFrom);
  if (values.publishedTo) params.set('publishedTo', values.publishedTo);
  if (values.minDaysLeft === '' && values.deadlineFrom)
    params.set('deadlineFrom', values.deadlineFrom);
  if (values.minDaysLeft === '' && values.deadlineTo) params.set('deadlineTo', values.deadlineTo);
  if (values.techStack) params.set('techStack', values.techStack);
  if (values.targetPlatforms.length > 0) {
    params.set('targetPlatforms', values.targetPlatforms.join(','));
  }
  if (values.industry) params.set('industry', values.industry);
  if (page > 1) params.set('page', String(page));
  const query = params.toString();
  return `/search${query ? `?${query}` : ''}`;
}

export function preservedSearchEntries(values: SearchFilterValues): Array<[string, string]> {
  const params = new URLSearchParams(searchHref({ ...values, query: '' }).split('?')[1] ?? '');
  return [...params.entries()];
}

export type SearchFilterCriterion =
  | 'status'
  | 'eBidding'
  | 'deptName'
  | 'year'
  | 'outcome'
  | 'budget'
  | 'published'
  | 'deadline'
  | 'techStack'
  | 'targetPlatforms'
  | 'industry';

/** Clears one visible criterion while preserving the search words and every other filter. */
export function withoutSearchFilter(
  values: SearchFilterValues,
  criterion: SearchFilterCriterion,
): SearchFilterValues {
  switch (criterion) {
    case 'status':
    case 'eBidding':
    case 'deptName':
    case 'year':
    case 'outcome':
      return { ...values, [criterion]: '' };
    case 'budget':
      return { ...values, minBudget: '', maxBudget: '' };
    case 'published':
      return { ...values, publishedFrom: '', publishedTo: '' };
    case 'deadline':
      return {
        ...values,
        deadlineFrom: '',
        deadlineTo: '',
        minDaysLeft: '',
      };
    case 'techStack':
      return { ...values, techStack: '' };
    case 'targetPlatforms':
      return { ...values, targetPlatforms: [] };
    case 'industry':
      return { ...values, industry: '' };
  }
}
