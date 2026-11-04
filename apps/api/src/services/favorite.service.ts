import type { Favorite, Procurement } from '@torfun/types';
import { NotFoundError } from '../core/errors';
import type { FavoriteStore } from '../repositories/favorite.repository';
import type { ProcurementStore } from '../repositories/procurement.repository';

/**
 * The Procurements a Business Development Officer has set aside to
 * reconsider later.
 *
 * Scoped directly to the caller's account — a favorite has no Company
 * indirection to resolve, unlike a Client or an Experience.
 */

export interface FavoriteEntry {
  favorite: Favorite;
  procurement: Procurement;
}

export class FavoriteService {
  constructor(
    private readonly favorites: FavoriteStore,
    private readonly procurements: ProcurementStore,
  ) {}

  async list(userId: string): Promise<FavoriteEntry[]> {
    const favorites = await this.favorites.listByUser(userId);
    const entries = await Promise.all(
      favorites.map(async (favorite) => ({
        favorite,
        procurement: await this.procurements.get(favorite.projectId),
      })),
    );
    // Ingested data is never deleted, so this should not happen in practice;
    // it is not a case a saved list should crash the page over.
    return entries.filter((entry): entry is FavoriteEntry => entry.procurement !== undefined);
  }

  async isFavorited(userId: string, projectId: string): Promise<boolean> {
    return (await this.favorites.find(userId, projectId)) !== null;
  }

  async add(userId: string, projectId: string): Promise<FavoriteEntry> {
    const procurement = await this.procurements.get(projectId);
    if (!procurement) throw new NotFoundError(`No ingested project ${projectId}`);

    const favorite = await this.favorites.add({ userId, projectId });
    return { favorite, procurement };
  }

  async remove(userId: string, projectId: string): Promise<void> {
    const removed = await this.favorites.remove(userId, projectId);
    if (!removed) throw new NotFoundError('Not favorited');
  }
}
