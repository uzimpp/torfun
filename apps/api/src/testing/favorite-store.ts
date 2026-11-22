import { ObjectId } from 'mongodb';
import type { Favorite } from '@torfun/types';
import type { FavoriteStore, NewFavorite } from '../repositories/favorite.repository';

/**
 * An in-memory `FavoriteStore`.
 *
 * The account scope is honoured exactly as the repository honours it — every
 * lookup filters on `userId` first — so a cross-account test fails here for
 * the same reason it would fail against Mongo.
 */
export class InMemoryFavoriteStore implements FavoriteStore {
  private readonly favorites = new Map<string, Favorite>();

  private key(userId: string, projectId: string): string {
    return `${userId}:${projectId}`;
  }

  async listByUser(userId: string): Promise<Favorite[]> {
    return [...this.favorites.values()]
      .filter((favorite) => favorite.userId === userId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async find(userId: string, projectId: string): Promise<Favorite | null> {
    return this.favorites.get(this.key(userId, projectId)) ?? null;
  }

  async add(input: NewFavorite): Promise<Favorite> {
    const existing = await this.find(input.userId, input.projectId);
    if (existing) return existing;

    const favorite: Favorite = {
      id: new ObjectId().toString(),
      userId: input.userId,
      projectId: input.projectId,
      createdAt: new Date(),
    };
    this.favorites.set(this.key(input.userId, input.projectId), favorite);
    return favorite;
  }

  async remove(userId: string, projectId: string): Promise<boolean> {
    return this.favorites.delete(this.key(userId, projectId));
  }
}
