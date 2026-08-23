import { mockTorRepository } from './mock-tor-repository';

export const getRecommendedTors = (limit?: number) => mockTorRepository.getRecommended(limit);
export const getLatestTors = (limit?: number) => mockTorRepository.getLatest(limit);
export const getFavoriteTors = () => mockTorRepository.getFavorites();
export const getTor = (id: string) => mockTorRepository.getById(id);
