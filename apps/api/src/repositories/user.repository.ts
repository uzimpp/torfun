import { ObjectId, type Collection, type Db } from 'mongodb';
import type { User, UserRole } from '@torfun/types';

/**
 * Data access for user accounts.
 *
 * This layer owns the only mapping between the stored document and the `User`
 * defined in `@torfun/types`. Nothing above it handles an `ObjectId`, and
 * `password_hash` leaves here exactly once — through `findCredentials`, which
 * names what it is doing — so no route can accidentally serialise it.
 */

/**
 * Persistence shape. snake_case fields match the documents already in Atlas;
 * this type must not escape the repository.
 */
interface UserDocument {
  _id: ObjectId;
  username: string;
  password_hash?: string;
  first_name?: string;
  last_name?: string;
  company_name: string;
  role: UserRole;
  is_active?: boolean;
  google_id?: string;
  email?: string;
  created_at: Date;
  updated_at: Date;
}

export interface NewUser {
  username: string;
  firstName: string;
  lastName: string;
  companyName: string;
  role: UserRole;
  passwordHash?: string;
  googleId?: string;
  email?: string;
}

/**
 * Accounts created before first/last name existed have neither field. They read
 * back as empty strings rather than crashing the schema — see the backfill in
 * `docs/migrations`. `is_active` predates nothing and simply defaults to true.
 */
function toDomain(document: UserDocument): User {
  return {
    id: document._id.toString(),
    username: document.username,
    firstName: document.first_name ?? '',
    lastName: document.last_name ?? '',
    companyName: document.company_name,
    role: document.role,
    email: document.email,
    isActive: document.is_active ?? true,
    createdAt: document.created_at,
    updatedAt: document.updated_at,
  };
}

export class UserRepository {
  constructor(private readonly getDb: () => Promise<Db>) {}

  private async collection(): Promise<Collection<UserDocument>> {
    return (await this.getDb()).collection<UserDocument>('users');
  }

  async findById(id: string): Promise<User | null> {
    // A malformed id is a miss, not a crash: `/me` is reachable with any
    // cookie contents and must not 500 on a hand-edited token.
    if (!ObjectId.isValid(id)) return null;
    const document = await (await this.collection()).findOne({ _id: new ObjectId(id) });
    return document ? toDomain(document) : null;
  }

  async findByUsername(username: string): Promise<User | null> {
    const document = await (await this.collection()).findOne({ username });
    return document ? toDomain(document) : null;
  }

  async findByGoogleId(googleId: string): Promise<User | null> {
    const document = await (await this.collection()).findOne({ google_id: googleId });
    return document ? toDomain(document) : null;
  }

  async findByEmail(email: string): Promise<User | null> {
    const document = await (await this.collection()).findOne({ email });
    return document ? toDomain(document) : null;
  }

  /**
   * The one read that exposes the stored hash, for password verification.
   * `passwordHash` is null for accounts created through Google sign-in.
   */
  async findCredentials(
    username: string,
  ): Promise<{ user: User; passwordHash: string | null } | null> {
    const document = await (await this.collection()).findOne({ username });
    if (!document) return null;
    return { user: toDomain(document), passwordHash: document.password_hash ?? null };
  }

  async create(input: NewUser): Promise<User> {
    const now = new Date();
    const document = {
      username: input.username,
      first_name: input.firstName,
      last_name: input.lastName,
      company_name: input.companyName,
      role: input.role,
      is_active: true,
      created_at: now,
      updated_at: now,
      ...(input.passwordHash ? { password_hash: input.passwordHash } : {}),
      ...(input.googleId ? { google_id: input.googleId } : {}),
      ...(input.email ? { email: input.email } : {}),
    };

    const result = await (await this.collection()).insertOne(document as UserDocument);
    return toDomain({ ...document, _id: result.insertedId } as UserDocument);
  }

  async linkGoogleId(id: string, googleId: string): Promise<void> {
    await (
      await this.collection()
    ).updateOne(
      { _id: new ObjectId(id) },
      { $set: { google_id: googleId, updated_at: new Date() } },
    );
  }
}
