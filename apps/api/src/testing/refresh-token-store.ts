import type {
  NewRefreshToken,
  RefreshTokenStore,
  StoredRefreshToken,
} from '../repositories/refresh-token.repository';

/**
 * An in-memory `RefreshTokenStore`, so a route test can register or log in
 * without a database. Tokens are stored, revoked and looked up for real —
 * rotation and reuse detection behave exactly as they do in production.
 */
export class InMemoryRefreshTokenStore implements RefreshTokenStore {
  private readonly rows: (StoredRefreshToken & { tokenHash: string })[] = [];

  async create(input: NewRefreshToken): Promise<void> {
    this.rows.push({
      id: String(this.rows.length + 1),
      userId: input.userId,
      familyId: input.familyId,
      expiresAt: input.expiresAt,
      tokenHash: input.tokenHash,
    });
  }

  async findByHash(tokenHash: string): Promise<StoredRefreshToken | null> {
    return this.rows.find((row) => row.tokenHash === tokenHash) ?? null;
  }

  async revoke(id: string): Promise<void> {
    const row = this.rows.find((candidate) => candidate.id === id);
    if (row && !row.revokedAt) row.revokedAt = new Date();
  }

  async revokeFamily(familyId: string): Promise<void> {
    for (const row of this.rows) {
      if (row.familyId === familyId && !row.revokedAt) row.revokedAt = new Date();
    }
  }
}
