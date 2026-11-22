import { createHash } from 'node:crypto';

/**
 * Known-breached password check (ASVS V6.2.12; advanced feature #169).
 *
 * Uses the Have I Been Pwned range API's k-anonymity scheme: only the first
 * five hex characters of the password's SHA-1 leave this server, never the
 * password or its full hash. The response is every breached suffix sharing that
 * prefix and the match is made here.
 *
 * Failure policy: **fail open, loudly**. If the service is slow or down,
 * sign-up must not be blocked on a third party, so the password is accepted and
 * the miss is logged for review; the local common-password list in
 * `password-policy.ts` still applies. `Add-Padding` hides the true response size.
 */
export interface BreachChecker {
  /** Resolves to how many times the password appears in known breaches (0 = not seen / unknown). */
  breachCount(password: string): Promise<number>;
}

export interface BreachCheckerOptions {
  endpoint?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  onUnavailable?: (reason: string) => void;
}

const DEFAULT_ENDPOINT = 'https://api.pwnedpasswords.com/range/';

export class PwnedPasswordsChecker implements BreachChecker {
  private readonly endpoint: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;
  private readonly onUnavailable: (reason: string) => void;

  constructor(options: BreachCheckerOptions = {}) {
    this.endpoint = options.endpoint ?? DEFAULT_ENDPOINT;
    this.timeoutMs = options.timeoutMs ?? 2000;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.onUnavailable = options.onUnavailable ?? (() => {});
  }

  async breachCount(password: string): Promise<number> {
    const sha1 = createHash('sha1').update(password).digest('hex').toUpperCase();
    const prefix = sha1.slice(0, 5);
    const suffix = sha1.slice(5);

    try {
      const response = await this.fetchImpl(`${this.endpoint}${prefix}`, {
        headers: { 'Add-Padding': 'true' },
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      if (!response.ok) {
        this.onUnavailable(`status ${response.status}`);
        return 0;
      }
      for (const line of (await response.text()).split('\n')) {
        const [candidate, count] = line.trim().split(':');
        if (candidate === suffix) return Number(count) || 0;
      }
      return 0;
    } catch (error) {
      this.onUnavailable(error instanceof Error ? error.name : 'error');
      return 0;
    }
  }
}

/** Used when no outside lookup is wanted (tests, offline development). */
export const noBreachCheck: BreachChecker = { breachCount: async () => 0 };
