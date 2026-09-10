import bcrypt from 'bcryptjs';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { ConflictError, ForbiddenError, NotFoundError, UnauthorizedError } from '../core/errors';
import type { User, UserRole } from '@torfun/types';
import type { RefreshTokenStore } from '../repositories/refresh-token.repository';
import type { UserStore } from '../repositories/user.repository';
import { splitGoogleName, type GoogleProfile } from './google-identity';

/**
 * Account registration, password login, and Google sign-in.
 *
 * Deliberately free of Fastify types: token signing arrives as a function so
 * this class can be unit-tested with a stub, and HTTP concerns (cookies,
 * status codes, redirects) stay in the route layer.
 */

export interface TokenPayload {
  user_id: string;
  username: string;
  role: UserRole;
}

export type SignToken = (payload: TokenPayload) => Promise<string> | string;

/**
 * Registration no longer asks for a company. The question is asked once, on
 * the company page, where there is room to explain that the record is shared
 * with colleagues — and the Company owns its own name (ADR-0007), so an
 * account has nowhere to keep a second copy of it.
 */
export interface RegisterInput {
  username: string;
  password: string;
  firstName: string;
  lastName: string;
}

/** Everyone self-registers as a BD officer; admin is granted, never claimed. */
const DEFAULT_ROLE: UserRole = 'business_development_officer';

/**
 * A signed-in session: a short-lived access token the API verifies on every
 * request, and the long-lived refresh token that renews it.
 */
export interface AuthResult {
  user: User;
  accessToken: string;
  refreshToken: string;
}

/** Cost factor for password hashing; ~250ms on commodity hardware in 2026. */
const BCRYPT_ROUNDS = 12;

/**
 * How long a refresh token stays usable, and so how long "stay signed in"
 * lasts. Lives here rather than in `plugins/jwt.ts` so this file keeps its
 * distance from Fastify; the route layer imports it for the cookie's Max-Age.
 */
export const REFRESH_TTL_SECONDS = 30 * 24 * 60 * 60;

/** Bytes of entropy in a refresh token. */
const REFRESH_TOKEN_BYTES = 32;

/**
 * Refresh tokens are stored as digests. Plain SHA-256 is right here — see the
 * note in `refresh-token.repository.ts` for why this isn't bcrypt.
 */
function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export class AuthService {
  constructor(
    private readonly users: UserStore,
    private readonly refreshTokens: RefreshTokenStore,
    private readonly signToken: SignToken,
  ) {}

  /**
   * Mints a fresh pair. Passing an existing `familyId` continues a rotation
   * chain; omitting it starts a new one, which is what a sign-in does — so
   * each device gets its own chain and logging out of one leaves the others.
   */
  private async issue(user: User, familyId: string = randomUUID()): Promise<AuthResult> {
    // Guarded here rather than at each call site so that no future sign-in
    // path can forget it: a deactivated account gets credentials from nowhere.
    if (!user.isActive) throw new ForbiddenError('Account is deactivated');

    const accessToken = await this.signToken({
      user_id: user.id,
      username: user.username,
      role: user.role,
    });

    // Only the digest is persisted; this is the one moment the secret exists.
    const refreshToken = randomBytes(REFRESH_TOKEN_BYTES).toString('base64url');
    await this.refreshTokens.create({
      userId: user.id,
      tokenHash: hashToken(refreshToken),
      familyId,
      expiresAt: new Date(Date.now() + REFRESH_TTL_SECONDS * 1000),
    });

    return { user, accessToken, refreshToken };
  }

  /**
   * Exchanges a refresh token for a new pair, retiring the one presented.
   *
   * This is the only point at which a signed-in user's record is re-read, so
   * it is where a role change or a deactivation takes effect — within one
   * access-token lifetime rather than never.
   */
  async refresh(presented: string): Promise<AuthResult> {
    const stored = await this.refreshTokens.findByHash(hashToken(presented));
    if (!stored) throw new UnauthorizedError('Invalid session');

    // A token offered twice means a copy is loose, because the legitimate
    // holder already exchanged this one. There is no way to tell which of the
    // two callers is the attacker, so retire the entire chain and make both
    // sign in again.
    if (stored.revokedAt) {
      await this.refreshTokens.revokeFamily(stored.familyId);
      throw new UnauthorizedError('Session revoked');
    }

    if (stored.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedError('Session expired');
    }

    const user = await this.users.findById(stored.userId);
    if (!user) {
      await this.refreshTokens.revokeFamily(stored.familyId);
      throw new UnauthorizedError('Invalid session');
    }

    if (!user.isActive) {
      // Deactivated mid-session: drop the chain so the refresh cookie stops
      // working from now on, rather than failing once and retrying forever.
      await this.refreshTokens.revokeFamily(stored.familyId);
      throw new ForbiddenError('Account is deactivated');
    }

    await this.refreshTokens.revoke(stored.id);
    return this.issue(user, stored.familyId);
  }

  /**
   * Ends the session a refresh token belongs to. An unknown or absent token is
   * a no-op: logging out twice, or with a cookie that has already expired, is
   * not an error worth surfacing.
   */
  async logout(presented: string | undefined): Promise<void> {
    if (!presented) return;

    const stored = await this.refreshTokens.findByHash(hashToken(presented));
    if (stored) await this.refreshTokens.revokeFamily(stored.familyId);
  }

  async register(input: RegisterInput): Promise<AuthResult> {
    if (await this.users.findByUsername(input.username)) {
      throw new ConflictError('Username already exists');
    }

    const user = await this.users.create({
      username: input.username,
      firstName: input.firstName,
      lastName: input.lastName,
      role: DEFAULT_ROLE,
      passwordHash: await bcrypt.hash(input.password, BCRYPT_ROUNDS),
    });

    return this.issue(user);
  }

  async login(username: string, password: string): Promise<AuthResult> {
    const credentials = await this.users.findCredentials(username);

    // One message for "no such user" and "wrong password" alike, so the
    // endpoint can't be used to enumerate valid usernames.
    if (!credentials?.passwordHash) {
      throw new UnauthorizedError('Invalid username or password');
    }

    if (!(await bcrypt.compare(password, credentials.passwordHash))) {
      throw new UnauthorizedError('Invalid username or password');
    }

    // `issue` rejects a deactivated account. Deliberately after the password
    // check, so the difference between "wrong password" and "disabled account"
    // is only visible to someone who already knows the password.
    return this.issue(credentials.user);
  }

  /**
   * Sign in via Google, creating the account on first use.
   *
   * An existing password account with the same email is linked rather than
   * duplicated, so a user who registered directly can later use the Google
   * button and land in the same account.
   */
  async loginWithGoogle(profile: GoogleProfile): Promise<AuthResult> {
    const linked = await this.users.findByGoogleId(profile.sub);
    if (linked) return this.issue(linked);

    const sameEmail = await this.users.findByEmail(profile.email);
    if (sameEmail) {
      await this.users.linkGoogleId(sameEmail.id, profile.sub);
      return this.issue(sameEmail);
    }

    const created = await this.users.create({
      username: profile.email,
      ...splitGoogleName(profile),
      role: DEFAULT_ROLE,
      googleId: profile.sub,
      email: profile.email,
    });
    return this.issue(created);
  }

  async getById(id: string): Promise<User> {
    const user = await this.users.findById(id);
    if (!user) throw new NotFoundError('User not found');
    return user;
  }
}
