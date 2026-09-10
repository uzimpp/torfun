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
  /**
   * The Company this account belongs to, stored as the string form of the
   * Company's id — the same value the API hands out. Null before the officer
   * has joined one, and null for administrators, who are exempt from the gate.
   * Replaces the free-text `company_name`; see the 2026-09-10 migration.
   */
  company_id?: string | null;
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
    companyId: document.company_id ?? null,
    role: document.role,
    email: document.email,
    isActive: document.is_active ?? true,
    createdAt: document.created_at,
    updatedAt: document.updated_at,
  };
}

/**
 * The slice of this repository the service layer needs.
 *
 * Services depend on this rather than the class, so an account can be created,
 * read and repointed at a Company in a route test without a database — and so
 * nothing above can quietly start issuing a query it has no business issuing.
 */
export interface UserStore {
  findById(id: string): Promise<User | null>;
  findByUsername(username: string): Promise<User | null>;
  findByGoogleId(googleId: string): Promise<User | null>;
  findByEmail(email: string): Promise<User | null>;
  findCredentials(username: string): Promise<{ user: User; passwordHash: string | null } | null>;
  create(input: NewUser): Promise<User>;
  linkGoogleId(id: string, googleId: string): Promise<void>;
  setCompanyId(id: string, companyId: string | null): Promise<void>;
}

export class UserRepository implements UserStore {
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
      company_id: null,
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

  /**
   * Points an account at a Company, or at none.
   *
   * Switching is a plain repoint (ADR-0008): the Company keeps its Clients and
   * Experiences, because they were never the person's to take with them.
   */
  async setCompanyId(id: string, companyId: string | null): Promise<void> {
    if (!ObjectId.isValid(id)) return;
    await (
      await this.collection()
    ).updateOne(
      { _id: new ObjectId(id) },
      { $set: { company_id: companyId, updated_at: new Date() } },
    );
  }
}
