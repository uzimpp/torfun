import type { Collection, Db, ObjectId } from 'mongodb';
import type { Favorite } from '@torfun/types';

/**
 * Data access for the Procurements a Business Development Officer has
 * favorited.
 *
 * Every method takes the caller's `userId` and puts it in the filter, the
 * same isolation rule `client.repository.ts` follows for a Company: there is
 * no method here that can reach a favorite without naming the account it
 * belongs to.
 */

/**
 * Persistence shape. snake_case matches the documents in Atlas; this type must
 * not escape the repository.
 *
 * `project_id` is the upstream `Procurement.projectId` — a natural key, not an
 * `ObjectId` — stored as the plain string the API already uses everywhere else.
 */
interface FavoriteDocument {
  _id: ObjectId;
  user_id: string;
  project_id: string;
  created_at: Date;
}

export interface NewFavorite {
  userId: string;
  projectId: string;
}

function toDomain(document: FavoriteDocument): Favorite {
  return {
    id: document._id.toString(),
    userId: document.user_id,
    projectId: document.project_id,
    createdAt: document.created_at,
  };
}

/** The slice of this repository the service layer needs. */
export interface FavoriteStore {
  listByUser(userId: string): Promise<Favorite[]>;
  find(userId: string, projectId: string): Promise<Favorite | null>;
  /** Idempotent: favoriting an already-favorited project returns the existing record. */
  add(input: NewFavorite): Promise<Favorite>;
  remove(userId: string, projectId: string): Promise<boolean>;
}

export class FavoriteRepository implements FavoriteStore {
  constructor(private readonly getDb: () => Promise<Db>) {}

  private async collection(): Promise<Collection<FavoriteDocument>> {
    return (await this.getDb()).collection<FavoriteDocument>('favorites');
  }

  /**
   * Idempotent; the unique index is what makes `add` safe under a double
   * click without a round trip to check first.
   */
  async ensureIndexes(): Promise<void> {
    await (
      await this.collection()
    ).createIndexes([
      { key: { user_id: 1, project_id: 1 }, unique: true },
      { key: { user_id: 1, created_at: -1 } },
    ]);
  }

  async listByUser(userId: string): Promise<Favorite[]> {
    const documents = await (
      await this.collection()
    )
      .find({ user_id: userId })
      .sort({ created_at: -1 })
      .toArray();
    return documents.map(toDomain);
  }

  async find(userId: string, projectId: string): Promise<Favorite | null> {
    const document = await (
      await this.collection()
    ).findOne({ user_id: userId, project_id: projectId });
    return document ? toDomain(document) : null;
  }

  async add(input: NewFavorite): Promise<Favorite> {
    const document = await (
      await this.collection()
    ).findOneAndUpdate(
      { user_id: input.userId, project_id: input.projectId },
      {
        $setOnInsert: {
          user_id: input.userId,
          project_id: input.projectId,
          created_at: new Date(),
        },
      },
      { upsert: true, returnDocument: 'after' },
    );
    // `upsert: true` guarantees a document comes back, inserted or found.
    return toDomain(document!);
  }

  async remove(userId: string, projectId: string): Promise<boolean> {
    const result = await (
      await this.collection()
    ).deleteOne({ user_id: userId, project_id: projectId });
    return result.deletedCount === 1;
  }
}
