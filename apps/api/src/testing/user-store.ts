import { ObjectId } from 'mongodb';
import type { User } from '@torfun/types';
import type { NewUser, UserStore } from '../repositories/user.repository';

/**
 * An in-memory `UserStore` for driving the API through `app.inject`.
 *
 * Deliberately not a mock: it really stores accounts, so a test asserts that
 * joining a company actually repointed the user rather than that some method
 * was called. Ids are real `ObjectId` strings, so a test can sign a session
 * for a seeded account and the real repository's id validation would accept
 * the same value.
 */
export class InMemoryUserStore implements UserStore {
  private readonly users = new Map<string, User>();
  private readonly passwordHashes = new Map<string, string>();
  private readonly googleIds = new Map<string, string>();

  /**
   * Seeds an account directly, the way a previous session would have left one.
   * Returns the stored user so a test can sign a token for its id.
   */
  seed(overrides: Partial<User> = {}): User {
    const now = new Date();
    const user: User = {
      id: new ObjectId().toString(),
      username: `officer-${this.users.size + 1}`,
      firstName: 'Somchai',
      lastName: 'Prasert',
      companyId: null,
      role: 'business_development_officer',
      isActive: true,
      createdAt: now,
      updatedAt: now,
      ...overrides,
    };
    this.users.set(user.id, user);
    return user;
  }

  async findById(id: string): Promise<User | null> {
    return this.users.get(id) ?? null;
  }

  async findByUsername(username: string): Promise<User | null> {
    return [...this.users.values()].find((user) => user.username === username) ?? null;
  }

  async findByGoogleId(googleId: string): Promise<User | null> {
    for (const [id, linked] of this.googleIds) {
      if (linked === googleId) return this.users.get(id) ?? null;
    }
    return null;
  }

  /** Test hook: the Google subject an account is linked to, if any. */
  googleIdOf(id: string): string | undefined {
    return this.googleIds.get(id);
  }

  async findByEmail(email: string): Promise<User | null> {
    return [...this.users.values()].find((user) => user.email === email) ?? null;
  }

  async findCredentials(
    lookup: Parameters<UserStore['findCredentials']>[0],
  ): Promise<{ user: User; passwordHash: string | null } | null> {
    const user =
      'id' in lookup ? await this.findById(lookup.id) : await this.findByUsername(lookup.username);
    if (!user) return null;
    return { user, passwordHash: this.passwordHashes.get(user.id) ?? null };
  }

  async updateProfile(id: string, profile: Pick<User, 'firstName' | 'lastName'>) {
    const user = this.users.get(id);
    if (!user?.isActive) return false;
    this.users.set(id, { ...user, ...profile, updatedAt: new Date() });
    return true;
  }

  async replacePassword(id: string, currentHash: string, newHash: string) {
    const user = this.users.get(id);
    if (!user?.isActive || this.passwordHashes.get(id) !== currentHash) return false;
    this.passwordHashes.set(id, newHash);
    this.users.set(id, { ...user, updatedAt: new Date() });
    return true;
  }

  async create(input: NewUser): Promise<User> {
    const user = this.seed({
      username: input.username,
      firstName: input.firstName,
      lastName: input.lastName,
      role: input.role,
      ...(input.email ? { email: input.email } : {}),
    });
    if (input.passwordHash) this.passwordHashes.set(user.id, input.passwordHash);
    if (input.googleId) this.googleIds.set(user.id, input.googleId);
    return user;
  }

  async linkGoogleId(id: string, googleId: string): Promise<boolean> {
    if (!this.users.has(id) || this.googleIds.has(id)) return false;
    this.googleIds.set(id, googleId);
    return true;
  }

  async setCompanyId(id: string, companyId: string | null): Promise<void> {
    const user = this.users.get(id);
    if (user) this.users.set(id, { ...user, companyId, joinRequest: null, updatedAt: new Date() });
  }

  async setJoinRequest(id: string, companyId: string | null): Promise<void> {
    const user = this.users.get(id);
    if (!user) return;
    const joinRequest = companyId ? { companyId, requestedAt: new Date() } : null;
    this.users.set(id, { ...user, joinRequest });
  }

  async acceptJoinRequest(id: string, companyId: string): Promise<boolean> {
    const user = this.users.get(id);
    if (!user?.isActive || user.joinRequest?.companyId !== companyId) return false;
    await this.setCompanyId(id, companyId);
    return true;
  }

  /** Oldest first: seeding order stands in for `created_at`. */
  async listByCompany(companyId: string): Promise<User[]> {
    return [...this.users.values()].filter((user) => user.companyId === companyId && user.isActive);
  }

  async listJoinRequests(companyId: string): Promise<User[]> {
    return [...this.users.values()]
      .filter((user) => user.joinRequest?.companyId === companyId && user.isActive)
      .sort(
        (a, b) =>
          (a.joinRequest?.requestedAt.getTime() ?? 0) - (b.joinRequest?.requestedAt.getTime() ?? 0),
      );
  }

  /** Newest first, the way the Mongo-backed repository sorts by `created_at`. */
  async list(): Promise<User[]> {
    return [...this.users.values()].reverse();
  }

  async countActiveAdmins(): Promise<number> {
    return [...this.users.values()].filter((user) => user.role === 'admin' && user.isActive).length;
  }

  async setRole(id: string, role: User['role']): Promise<void> {
    const user = this.users.get(id);
    if (user) this.users.set(id, { ...user, role, updatedAt: new Date() });
  }

  async setActive(id: string, isActive: boolean): Promise<void> {
    const user = this.users.get(id);
    if (user) this.users.set(id, { ...user, isActive, updatedAt: new Date() });
  }
}
