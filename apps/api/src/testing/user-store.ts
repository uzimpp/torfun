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

  async findByGoogleId(): Promise<User | null> {
    return null;
  }

  async findByEmail(email: string): Promise<User | null> {
    return [...this.users.values()].find((user) => user.email === email) ?? null;
  }

  async findCredentials(
    username: string,
  ): Promise<{ user: User; passwordHash: string | null } | null> {
    const user = await this.findByUsername(username);
    if (!user) return null;
    return { user, passwordHash: this.passwordHashes.get(user.id) ?? null };
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
    return user;
  }

  async linkGoogleId(): Promise<void> {}

  async setCompanyId(id: string, companyId: string | null): Promise<void> {
    const user = this.users.get(id);
    if (user) this.users.set(id, { ...user, companyId, updatedAt: new Date() });
  }
}
