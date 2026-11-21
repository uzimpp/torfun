import { afterEach, describe, expect, test } from 'bun:test';
import { egpGet, openDataGet } from './client';
import { assertAllowedUpstream, OutboundBlockedError, UPSTREAM_HOSTS } from './outbound-guard';

/** Threat T-10 (SSRF / redirect abuse); ASVS V1.3.6, V12.3.2, V15.2.5. */
const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

/** A fake upstream: answers each URL from `routes`, records every URL asked. */
function fakeUpstream(routes: Record<string, () => Response>) {
  const asked: string[] = [];
  globalThis.fetch = (async (input: string | URL, init?: RequestInit) => {
    const url = String(input);
    asked.push(url);
    expect(init?.redirect).toBe('manual');
    const answer = routes[url];
    return answer ? answer() : new Response('not found', { status: 404 });
  }) as typeof fetch;
  return asked;
}
const redirect = (location: string) => () =>
  new Response(null, { status: 302, headers: { location } });

describe('outbound allowlist', () => {
  test('is exactly the hosts the endpoint constants name', () => {
    expect([...UPSTREAM_HOSTS].sort()).toEqual([
      'opend.data.go.th',
      'process.gprocurement.go.th',
      'process5.gprocurement.go.th',
    ]);
  });

  test.each([
    ['http://process5.gprocurement.go.th/x', 'protocol'],
    ['https://169.254.169.254/latest/meta-data/', 'not an upstream'],
    ['https://localhost/admin', 'not an upstream'],
    ['https://10.0.0.5/', 'not an upstream'],
    ['https://process5.gprocurement.go.th.evil.example/x', 'not an upstream'],
    ['https://user:pw@process5.gprocurement.go.th/x', 'credentials'],
    ['https://process5.gprocurement.go.th:8443/x', 'port'],
    ['file:///etc/passwd', 'protocol'],
    ['not a url', 'valid URL'],
  ])('refuses %s', (url, reason) => {
    expect(() => assertAllowedUpstream(url)).toThrow(reason);
  });

  test('accepts the real upstream endpoints', () => {
    expect(assertAllowedUpstream('https://process5.gprocurement.go.th/a?b=1').hostname).toBe(
      'process5.gprocurement.go.th',
    );
  });
});

describe('redirects are checked hop by hop', () => {
  const START = 'https://process5.gprocurement.go.th/start';

  test('a redirect to the cloud metadata endpoint is refused and never requested', async () => {
    const asked = fakeUpstream({ [START]: redirect('http://169.254.169.254/latest/meta-data/') });
    await expect(egpGet(START, {}, {})).rejects.toBeInstanceOf(OutboundBlockedError);
    expect(asked).toEqual([START]);
  });

  test('a redirect to a private address over https is refused too', async () => {
    const asked = fakeUpstream({ [START]: redirect('https://192.168.1.10/internal') });
    await expect(egpGet(START, {}, {})).rejects.toThrow('not an upstream');
    expect(asked).toHaveLength(1);
  });

  test('a refused hop is not retried (no hammering on a policy violation)', async () => {
    const asked = fakeUpstream({ [START]: redirect('https://evil.example/') });
    await expect(egpGet(START, {}, {})).rejects.toBeInstanceOf(OutboundBlockedError);
    expect(asked).toHaveLength(1);
  });

  test('a redirect within the allowlist is followed, including a relative one', async () => {
    const asked = fakeUpstream({
      [START]: redirect('/moved'),
      'https://process5.gprocurement.go.th/moved': redirect(
        'https://process.gprocurement.go.th/final',
      ),
      'https://process.gprocurement.go.th/final': () => new Response('{"ok":true}'),
    });
    const response = await egpGet(START, {}, {});
    expect(await response.json()).toEqual({ ok: true });
    expect(asked).toHaveLength(3);
  });

  test('a redirect loop is cut off', async () => {
    fakeUpstream({ [START]: redirect(START) });
    await expect(egpGet(START, {}, {})).rejects.toThrow('redirects');
  });

  test('the open-data client is held to the same policy', async () => {
    const asked = fakeUpstream({});
    await expect(openDataGet('https://attacker.example/x', {}, 'k')).rejects.toBeInstanceOf(
      OutboundBlockedError,
    );
    expect(asked).toEqual([]);
  });
});
