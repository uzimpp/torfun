import { ObjectId, type Collection, type Db } from 'mongodb';

/**
 * Data access for refresh tokens.
 *
 * Only a token's SHA-256 digest is stored, so a leaked database dump hands out
 * no live sessions. SHA-256 rather than bcrypt on purpose: bcrypt's cost factor
 * exists to slow guessing of low-entropy passwords, and these are 256 bits of
 * randomness with nothing to guess.
 *
 * Tokens are never deleted here — they are marked revoked, because a token
 * that comes back after revocation is the signal that a copy leaked. Expired
 * rows are swept by the TTL index in `docs/migrations`.
 */

interface RefreshTokenDocument {
  _id: ObjectId;
  user_id: ObjectId;
  token_hash: string;
  /** Groups a rotation chain, so one compromised token retires the whole run. */
  family_id: string;
  expires_at: Date;
  revoked_at?: Date;
  created_at: Date;
}

/** A stored token minus the secret, which exists only in transit. */
export interface StoredRefreshToken {
  id: string;
  userId: string;
  familyId: string;
  expiresAt: Date;
  revokedAt?: Date;
}

export interface NewRefreshToken {
  userId: string;
  tokenHash: string;
  familyId: string;
  expiresAt: Date;
}

function toDomain(document: RefreshTokenDocument): StoredRefreshToken {
  return {
    id: document._id.toString(),
    userId: document.user_id.toString(),
    familyId: document.family_id,
    expiresAt: document.expires_at,
    revokedAt: document.revoked_at,
  };
}

/** The slice of this repository `AuthService` needs. */
export interface RefreshTokenStore {
  create(input: NewRefreshToken): Promise<void>;
  findByHash(tokenHash: string): Promise<StoredRefreshToken | null>;
  revoke(id: string): Promise<void>;
  revokeFamily(familyId: string): Promise<void>;
}

export class RefreshTokenRepository implements RefreshTokenStore {
  constructor(private readonly getDb: () => Promise<Db>) {}

  private async collection(): Promise<Collection<RefreshTokenDocument>> {
    return (await this.getDb()).collection<RefreshTokenDocument>('refresh_tokens');
  }

  async create(input: NewRefreshToken): Promise<void> {
    await (
      await this.collection()
    ).insertOne({
      user_id: new ObjectId(input.userId),
      token_hash: input.tokenHash,
      family_id: input.familyId,
      expires_at: input.expiresAt,
      created_at: new Date(),
    } as RefreshTokenDocument);
  }

  async findByHash(tokenHash: string): Promise<StoredRefreshToken | null> {
    const document = await (await this.collection()).findOne({ token_hash: tokenHash });
    return document ? toDomain(document) : null;
  }

  /** Retires one token once it has been exchanged for its successor. */
  async revoke(id: string): Promise<void> {
    await (
      await this.collection()
    ).updateOne(
      { _id: new ObjectId(id), revoked_at: { $exists: false } },
      { $set: { revoked_at: new Date() } },
    );
  }

  /** Retires a whole chain: used by logout, and when a reuse is detected. */
  async revokeFamily(familyId: string): Promise<void> {
    await (
      await this.collection()
    ).updateMany(
      { family_id: familyId, revoked_at: { $exists: false } },
      { $set: { revoked_at: new Date() } },
    );
  }
}
