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
  /** A request to join a Company, waiting for one of its managers. */
  join_request?: { company_id: string; requested_at: Date } | null;
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

type CredentialLookup = { id: string } | { username: string };

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
    joinRequest: document.join_request
      ? {
          companyId: document.join_request.company_id,
          requestedAt: document.join_request.requested_at,
        }
      : null,
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
  findCredentials(
    lookup: CredentialLookup,
  ): Promise<{ user: User; passwordHash: string | null } | null>;
  updateProfile(id: string, profile: Pick<User, 'firstName' | 'lastName'>): Promise<boolean>;
  replacePassword(id: string, currentHash: string, newHash: string): Promise<boolean>;
  create(input: NewUser): Promise<User>;
  /**
   * Links a Google subject to an account that has none yet. False when the
   * account already has a Google identity (or is gone), and nothing changes.
   */
  linkGoogleId(id: string, googleId: string): Promise<boolean>;
  /** Repoints an account; any pending join request ends with it. */
  setCompanyId(id: string, companyId: string | null): Promise<void>;
  setJoinRequest(id: string, companyId: string | null): Promise<void>;
  /**
   * Moves an active account into the Company it asked to join, only if that
   * request is still the one on file. False when it was withdrawn, replaced or
   * the account was deactivated in the meantime.
   */
  acceptJoinRequest(id: string, companyId: string): Promise<boolean>;
  /** Active accounts in a Company, oldest first. */
  listByCompany(companyId: string): Promise<User[]>;
  /** Active accounts waiting to join a Company, oldest request first. */
  listJoinRequests(companyId: string): Promise<User[]>;
  /** Every account, newest first — the account-management screen's one read. */
  list(): Promise<User[]>;
  /** How many `admin` accounts are still active, for the last-admin guard. */
  countActiveAdmins(): Promise<number>;
  setRole(id: string, role: UserRole): Promise<void>;
  setActive(id: string, isActive: boolean): Promise<void>;
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
    lookup: CredentialLookup,
  ): Promise<{ user: User; passwordHash: string | null } | null> {
    if ('id' in lookup && !ObjectId.isValid(lookup.id)) return null;
    const filter = 'id' in lookup ? { _id: new ObjectId(lookup.id) } : lookup;
    const document = await (await this.collection()).findOne(filter);
    if (!document) return null;
    return { user: toDomain(document), passwordHash: document.password_hash ?? null };
  }

  async updateProfile(id: string, { firstName, lastName }: Pick<User, 'firstName' | 'lastName'>) {
    if (!ObjectId.isValid(id)) return false;
    const result = await (
      await this.collection()
    ).updateOne(
      { _id: new ObjectId(id), is_active: { $ne: false } },
      { $set: { first_name: firstName, last_name: lastName, updated_at: new Date() } },
    );
    return result.matchedCount === 1;
  }

  async replacePassword(id: string, currentHash: string, newHash: string) {
    if (!ObjectId.isValid(id)) return false;
    const result = await (
      await this.collection()
    ).updateOne(
      { _id: new ObjectId(id), is_active: { $ne: false }, password_hash: currentHash },
      { $set: { password_hash: newHash, updated_at: new Date() } },
    );
    return result.matchedCount === 1;
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

  async linkGoogleId(id: string, googleId: string): Promise<boolean> {
    // Conditional in the filter, so an account linked to one Google identity is
    // never repointed at another, even by two sign-ins racing.
    const result = await (
      await this.collection()
    ).updateOne(
      { _id: new ObjectId(id), google_id: { $exists: false } },
      { $set: { google_id: googleId, updated_at: new Date() } },
    );
    return result.modifiedCount === 1;
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
      { $set: { company_id: companyId, updated_at: new Date() }, $unset: { join_request: '' } },
    );
  }

  async setJoinRequest(id: string, companyId: string | null): Promise<void> {
    if (!ObjectId.isValid(id)) return;
    const change = companyId
      ? { $set: { join_request: { company_id: companyId, requested_at: new Date() } } }
      : { $unset: { join_request: '' as const } };
    await (await this.collection()).updateOne({ _id: new ObjectId(id) }, change);
  }

  async acceptJoinRequest(id: string, companyId: string): Promise<boolean> {
    if (!ObjectId.isValid(id)) return false;
    const result = await (
      await this.collection()
    ).updateOne(
      { _id: new ObjectId(id), is_active: { $ne: false }, 'join_request.company_id': companyId },
      { $set: { company_id: companyId, updated_at: new Date() }, $unset: { join_request: '' } },
    );
    return result.matchedCount === 1;
  }

  async listByCompany(companyId: string): Promise<User[]> {
    const documents = await (
      await this.collection()
    )
      .find({ company_id: companyId, is_active: { $ne: false } })
      // `_id` breaks ties between accounts created in the same millisecond.
      .sort({ created_at: 1, _id: 1 })
      .toArray();
    return documents.map(toDomain);
  }

  async listJoinRequests(companyId: string): Promise<User[]> {
    const documents = await (
      await this.collection()
    )
      .find({ 'join_request.company_id': companyId, is_active: { $ne: false } })
      .sort({ 'join_request.requested_at': 1 })
      .toArray();
    return documents.map(toDomain);
  }

  async list(): Promise<User[]> {
    const documents = await (await this.collection()).find().sort({ created_at: -1 }).toArray();
    return documents.map(toDomain);
  }

  /**
   * Active administrators only. `is_active` is absent on accounts that predate
   * it and reads back as true (see `toDomain`), so the query counts "not
   * explicitly deactivated" rather than `is_active: true`.
   */
  async countActiveAdmins(): Promise<number> {
    return (await this.collection()).countDocuments({
      role: 'admin',
      is_active: { $ne: false },
    });
  }

  async setRole(id: string, role: UserRole): Promise<void> {
    if (!ObjectId.isValid(id)) return;
    await (
      await this.collection()
    ).updateOne({ _id: new ObjectId(id) }, { $set: { role, updated_at: new Date() } });
  }

  async setActive(id: string, isActive: boolean): Promise<void> {
    if (!ObjectId.isValid(id)) return;
    await (
      await this.collection()
    ).updateOne(
      { _id: new ObjectId(id) },
      { $set: { is_active: isActive, updated_at: new Date() } },
    );
  }
}
