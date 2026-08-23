import type { MatchResult, Tor } from '@torfun/types';

export type TorWithMatch = Tor & { match?: MatchResult; isFavorite?: boolean };

export type TorDetailSummary = {
  overview: string;
  objectives: string[];
  scope: string[];
  deliverables: string[];
  qualifications: string[];
};

export type TorSearchFilters = {
  query?: string;
  agency?: string;
  technology?: string;
  minBudget?: number;
  minMatchScore?: number;
  sort?: 'deadline' | 'published' | 'match';
};

export type PaginatedTors = {
  items: TorWithMatch[];
  total: number;
  page: number;
  pageSize: number;
};

export interface TorRepository {
  getRecommended(limit?: number): Promise<TorWithMatch[]>;
  getLatest(limit?: number): Promise<TorWithMatch[]>;
  getFavorites(): Promise<TorWithMatch[]>;
  getById(id: string): Promise<TorWithMatch | null>;
  search(filters?: TorSearchFilters): Promise<PaginatedTors>;
}
