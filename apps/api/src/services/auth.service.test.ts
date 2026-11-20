import { beforeEach, describe, expect, test } from 'bun:test';
import { AuthService, type TokenPayload } from './auth.service';
import type {
  NewRefreshToken,
  RefreshTokenStore,
  StoredRefreshToken,
} from '../repositories/refresh-token.repository';
import type { UserStore } from '../repositories/user.repository';
import type { User } from '@torfun/types';

/**
 * The service is framework-free by design, so these run against in-memory
 * stubs with no Mongo and no Fastify. Sessions are seeded through Google
 * sign-in rather than `login`, purely to skip bcrypt's deliberate ~250ms.
 */

type Row = StoredRefreshToken & { tokenHash: string };

class FakeRefreshTokens {
  readonly rows: Row[] = [];

  async create(input: NewRefreshToken): Promise<void> {
    this.rows.push({
      id: String(this.rows.length + 1),
      userId: input.userId,
      familyId: input.familyId,
      familyStartedAt: input.familyStartedAt,
      expiresAt: input.expiresAt,
      tokenHash: input.tokenHash,
    });
  }

  /** Holds every read until this many callers are waiting, to force a race. */
  barrier = 0;
  private waiting: (() => void)[] = [];

  async findByHash(tokenHash: string): Promise<StoredRefreshToken | null> {
    if (this.barrier > 0) {
      await new Promise<void>((resolve) => {
        this.waiting.push(resolve);
        if (this.waiting.length >= this.barrier) for (const release of this.waiting) release();
      });
    }
    const row = this.rows.find((candidate) => candidate.tokenHash === tokenHash);
    return row ? { ...row } : null;
  }

  async revoke(id: string): Promise<boolean> {
    const row = this.rows.find((candidate) => candidate.id === id);
    if (!row || row.revokedAt) return false;
    row.revokedAt = new Date();
    return true;
  }

  async revokeFamily(familyId: string): Promise<void> {
    for (const row of this.rows) {
      if (row.familyId === familyId && !row.revokedAt) row.revokedAt = new Date();
    }
  }

  async isFamilyActive(familyId: string): Promise<boolean> {
    return this.rows.some((row) => row.familyId === familyId && !row.revokedAt);
  }

  async revokeAllForUser(userId: string): Promise<void> {
    for (const row of this.rows) if (row.userId === userId) row.revokedAt ??= new Date();
  }
}

function makeUser(): User {
  return {
    id: 'user-1',
    username: 'somchai',
    firstName: 'Somchai',
    lastName: 'Prasert',
    companyId: null,
    role: 'business_development_officer',
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

describe('AuthService session rotation', () => {
  let user: User;
  let tokens: FakeRefreshTokens;
  let signed: TokenPayload[];
  let service: AuthService;

  const signIn = () => service.loginWithGoogle({ sub: 'google-1', email: 'somchai@example.com' });

  beforeEach(() => {
    user = makeUser();
    tokens = new FakeRefreshTokens();
    signed = [];

    const users = {
      findById: async (id: string) => (id === user.id ? user : null),
      findByGoogleId: async () => user,
    } as unknown as UserStore;

    service = new AuthService(users, tokens as unknown as RefreshTokenStore, (payload) => {
      signed.push(payload);
      return `access-${signed.length}`;
    });
  });

  test('signing in stores only a digest of the refresh token', async () => {
    const session = await signIn();

    expect(session.refreshToken).toBeTruthy();
    expect(tokens.rows).toHaveLength(1);
    expect(tokens.rows[0]?.tokenHash).not.toBe(session.refreshToken);
    expect(tokens.rows[0]?.tokenHash).toMatch(/^[0-9a-f]{64}$/);
  });

  test('refreshing rotates the token and retires the old one', async () => {
    const first = await signIn();
    const second = await service.refresh(first.refreshToken);

    expect(second.refreshToken).not.toBe(first.refreshToken);
    expect(tokens.rows[0]?.revokedAt).toBeDefined();
    expect(tokens.rows[1]?.revokedAt).toBeUndefined();
    // Both halves of the chain share a family, so logout can retire it whole.
    expect(tokens.rows[1]?.familyId).toBe(tokens.rows[0]!.familyId);
  });

  test('a spent token cannot be exchanged twice', async () => {
    const first = await signIn();
    await service.refresh(first.refreshToken);

    await expect(service.refresh(first.refreshToken)).rejects.toThrow('Session revoked');
  });

  test('two concurrent refreshes with one token: one wins, the other is reuse', async () => {
    const first = await signIn();
    tokens.barrier = 2;

    const results = await Promise.allSettled([
      service.refresh(first.refreshToken),
      service.refresh(first.refreshToken),
    ]);
    tokens.barrier = 0;

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.filter((result) => result.status === 'rejected');
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason.message).toBe('Session revoked');
    // The winner's successor is retired with the rest of the family.
    expect(tokens.rows.every((row) => row.revokedAt)).toBe(true);
    expect(await tokens.isFamilyActive(tokens.rows[0]!.familyId)).toBe(false);
  });

  test('reuse retires the whole family, including the live token', async () => {
    const first = await signIn();
    const second = await service.refresh(first.refreshToken);

    // The attacker replays the token the legitimate holder already spent...
    await expect(service.refresh(first.refreshToken)).rejects.toThrow('Session revoked');

    // ...which must also invalidate the successor now held by the real user.
    await expect(service.refresh(second.refreshToken)).rejects.toThrow('Session revoked');
  });

  test('a role change is picked up at the next refresh', async () => {
    const session = await signIn();
    expect(signed.at(-1)?.role).toBe('business_development_officer');

    user.role = 'admin';
    await service.refresh(session.refreshToken);

    expect(signed.at(-1)?.role).toBe('admin');
  });

  test('deactivating an account ends the session at the next refresh', async () => {
    const session = await signIn();
    user.isActive = false;

    await expect(service.refresh(session.refreshToken)).rejects.toThrow('Account is deactivated');
    expect(tokens.rows.every((row) => row.revokedAt)).toBe(true);
  });

  test('a deactivated account cannot sign in at all', async () => {
    user.isActive = false;

    await expect(signIn()).rejects.toThrow('Account is deactivated');
  });

  test('logging out retires the session', async () => {
    const session = await signIn();
    await service.logout(session.refreshToken);

    await expect(service.refresh(session.refreshToken)).rejects.toThrow('Session revoked');
  });

  test('logging out without a cookie is not an error', async () => {
    await service.logout(undefined);
  });
});
