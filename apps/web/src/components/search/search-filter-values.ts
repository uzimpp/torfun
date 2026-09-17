import type { ProcurementFilters, TargetPlatform } from '@torfun/types';

export interface SearchFilterValues {
  query: string;
  minBudget: string;
  maxBudget: string;
  publishedFrom: string;
  publishedTo: string;
  deadlineFrom: string;
  deadlineTo: string;
  techStack: string;
  targetPlatforms: TargetPlatform[];
  industry: string;
  purchaseMethod: string;
}

export const EMPTY_SEARCH_FILTERS: SearchFilterValues = {
  query: '',
  minBudget: '',
  maxBudget: '',
  publishedFrom: '',
  publishedTo: '',
  deadlineFrom: '',
  deadlineTo: '',
  techStack: '',
  targetPlatforms: [],
  industry: '',
  purchaseMethod: '',
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
    minBudget: first(params.minBudget),
    maxBudget: first(params.maxBudget),
    publishedFrom: first(params.publishedFrom),
    publishedTo: first(params.publishedTo),
    deadlineFrom: first(params.deadlineFrom),
    deadlineTo: first(params.deadlineTo),
    techStack: first(params.techStack),
    targetPlatforms: [...new Set(platforms)],
    industry: first(params.industry),
    purchaseMethod: first(params.purchaseMethod),
  };
}

export function parseSearchPage(params: RawSearchParams): number {
  const page = Number(first(params.page));
  return Number.isInteger(page) && page > 0 ? page : 1;
}

export function activeFilterCount(values: SearchFilterValues): number {
  return [
    values.minBudget || values.maxBudget,
    values.publishedFrom || values.publishedTo,
    values.deadlineFrom || values.deadlineTo,
    values.techStack,
    values.targetPlatforms.length > 0,
    values.industry,
    values.purchaseMethod,
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
    ...(values.query ? { q: values.query } : {}),
    ...(values.minBudget ? { minBudget: number(values.minBudget) } : {}),
    ...(values.maxBudget ? { maxBudget: number(values.maxBudget) } : {}),
    ...(values.publishedFrom ? { publishedFrom: values.publishedFrom } : {}),
    ...(values.publishedTo ? { publishedTo: values.publishedTo } : {}),
    ...(values.deadlineFrom ? { deadlineFrom: values.deadlineFrom } : {}),
    ...(values.deadlineTo ? { deadlineTo: values.deadlineTo } : {}),
    ...(terms.length > 0 ? { techStack: terms } : {}),
    ...(values.targetPlatforms.length > 0 ? { targetPlatforms: values.targetPlatforms } : {}),
    ...(values.industry ? { industry: values.industry } : {}),
    ...(values.purchaseMethod ? { purchaseMethod: values.purchaseMethod } : {}),
  };
}

export function searchHref(values: SearchFilterValues, page = 1): string {
  const params = new URLSearchParams();
  if (values.query) params.set('q', values.query);
  if (values.minBudget) params.set('minBudget', values.minBudget);
  if (values.maxBudget) params.set('maxBudget', values.maxBudget);
  if (values.publishedFrom) params.set('publishedFrom', values.publishedFrom);
  if (values.publishedTo) params.set('publishedTo', values.publishedTo);
  if (values.deadlineFrom) params.set('deadlineFrom', values.deadlineFrom);
  if (values.deadlineTo) params.set('deadlineTo', values.deadlineTo);
  if (values.techStack) params.set('techStack', values.techStack);
  if (values.targetPlatforms.length > 0) {
    params.set('targetPlatforms', values.targetPlatforms.join(','));
  }
  if (values.industry) params.set('industry', values.industry);
  if (values.purchaseMethod) params.set('purchaseMethod', values.purchaseMethod);
  if (page > 1) params.set('page', String(page));
  const query = params.toString();
  return `/search${query ? `?${query}` : ''}`;
}

export function preservedSearchEntries(values: SearchFilterValues): Array<[string, string]> {
  const params = new URLSearchParams(searchHref({ ...values, query: '' }).split('?')[1] ?? '');
  return [...params.entries()];
}
