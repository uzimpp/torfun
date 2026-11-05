import type { Favorite, Procurement } from '@torfun/types';
import { NotFoundError } from '../core/errors';
import type { FavoriteStore } from '../repositories/favorite.repository';
import type { ProcurementStore } from '../repositories/procurement.repository';
import { isVisibleTo, presentTo, type Audience } from './audience';

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

  async list(userId: string, audience: Audience): Promise<FavoriteEntry[]> {
    const favorites = await this.favorites.listByUser(userId);
    const entries = await Promise.all(
      favorites.map(async (favorite) => {
        const procurement = await this.procurements.get(favorite.projectId);
        if (!procurement || procurement.publicationRemoval || !isVisibleTo(audience, procurement)) {
          return null;
        }
        return { favorite, procurement: presentTo(audience, procurement) };
      }),
    );
    return entries.filter((entry) => entry !== null);
  }

  async isFavorited(userId: string, projectId: string): Promise<boolean> {
    return (await this.favorites.find(userId, projectId)) !== null;
  }

  async add(userId: string, projectId: string, audience: Audience): Promise<FavoriteEntry> {
    const procurement = await this.procurements.get(projectId);
    if (!procurement || procurement.publicationRemoval || !isVisibleTo(audience, procurement)) {
      throw new NotFoundError(`No ingested project ${projectId}`);
    }

    const favorite = await this.favorites.add({ userId, projectId });
    return { favorite, procurement: presentTo(audience, procurement) };
  }

  async remove(userId: string, projectId: string): Promise<void> {
    const removed = await this.favorites.remove(userId, projectId);
    if (!removed) throw new NotFoundError('Not favorited');
  }
}
