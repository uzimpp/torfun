import { describe, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { PwnedPasswordsChecker } from './breached-passwords';
import { AuthService } from './auth.service';
import { BadRequestError } from '../core/errors';
import { GOOD_PASSWORD, LEAKED_PASSWORD } from '../testing/passwords';

const sha1 = (p: string) => createHash('sha1').update(p).digest('hex').toUpperCase();

/** A fake HIBP: serves the suffixes it was seeded with for the prefix asked about. */
function fakeHibp(breached: string[]) {
  const requested: string[] = [];
  const fetchImpl = (async (url: string) => {
    const prefix = String(url).split('/').pop()!;
    requested.push(String(url));
    const body = breached
      .filter((p) => sha1(p).startsWith(prefix))
      .map((p) => `${sha1(p).slice(5)}:42`)
      .concat(['0000000000000000000000000000000000A:0']) // padding row
      .join('\r\n');
    return new Response(body, { status: 200 });
  }) as unknown as typeof fetch;
  return { fetchImpl, requested };
}

describe('breached password check (k-anonymity)', () => {
  test('a breached password is reported with its count', async () => {
    const { fetchImpl } = fakeHibp([LEAKED_PASSWORD]);
    const checker = new PwnedPasswordsChecker({ fetchImpl });
    expect(await checker.breachCount(LEAKED_PASSWORD)).toBe(42);
  });

  test('an unseen password is accepted', async () => {
    const { fetchImpl } = fakeHibp(['something-else-entirely']);
    expect(await new PwnedPasswordsChecker({ fetchImpl }).breachCount(GOOD_PASSWORD)).toBe(0);
  });

  test('only a 5-character hash prefix leaves the server', async () => {
    const { fetchImpl, requested } = fakeHibp([]);
    await new PwnedPasswordsChecker({ fetchImpl }).breachCount(GOOD_PASSWORD);
    expect(requested).toHaveLength(1);
    const sent = requested[0]!;
    expect(sent.split('/').pop()).toHaveLength(5);
    expect(sent).not.toContain('plum');
    expect(sent).not.toContain(sha1(GOOD_PASSWORD).slice(5));
  });

  test('fails open when the service errors, times out or is unreachable, and says so', async () => {
    const reasons: string[] = [];
    const failing = [
      (async () => new Response('', { status: 503 })) as unknown as typeof fetch,
      (async () => {
        throw new Error('network down');
      }) as unknown as typeof fetch,
    ];
    for (const fetchImpl of failing) {
      const checker = new PwnedPasswordsChecker({
        fetchImpl,
        onUnavailable: (r) => reasons.push(r),
      });
      expect(await checker.breachCount('anything-at-all-123')).toBe(0);
    }
    expect(reasons).toEqual(['status 503', 'Error']);
  });

  test('registration refuses a breached password before touching any store', async () => {
    // The stores are never reached: screening runs first, so empty stand-ins prove the order.
    const service = new AuthService({} as never, {} as never, () => 'token', {
      breachCount: async () => 7,
    });
    await expect(
      service.register({
        username: 'somchai',
        password: GOOD_PASSWORD,
        firstName: 'S',
        lastName: 'P',
      }),
    ).rejects.toBeInstanceOf(BadRequestError);
  });
});
