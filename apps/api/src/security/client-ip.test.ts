import { describe, expect, test } from 'bun:test';
import { buildApp } from '../app';
import { testEnv } from '../testing/env';

/**
 * ASVS V2.4.1 (v5 anti-automation) / threat T-02. The per-IP limits are only
 * as good as the address they key on. Found while preparing the pentest: on
 * Cloud Run every request reaches the container from Google's front end, so
 * with the header ignored all users shared one bucket. Trusting exactly one hop
 * fixes that; trusting the header blindly would let a client pick its own IP.
 */
async function seenIp(hops: number, forwardedFor?: string) {
  const app = await buildApp(testEnv({ LOG_LEVEL: 'fatal', TRUST_PROXY_HOPS: hops }));
  app.get('/ip-probe', async (request) => ({ ip: request.ip }));
  try {
    const res = await app.inject({
      method: 'GET',
      url: '/ip-probe',
      remoteAddress: '169.254.1.1', // the proxy, as the socket sees it
      headers: forwardedFor ? { 'x-forwarded-for': forwardedFor } : {},
    });
    return res.json<{ ip: string }>().ip;
  } finally {
    await app.close();
  }
}

describe('client address behind a proxy', () => {
  test('by default the header is ignored, so a client cannot choose its address', async () => {
    expect(await seenIp(0, '203.0.113.9')).toBe('169.254.1.1');
  });

  test('with one trusted hop, the address the proxy appended is used', async () => {
    expect(await seenIp(1, '198.51.100.20')).toBe('198.51.100.20');
  });

  test('with one trusted hop, entries the client forged in front are ignored', async () => {
    // The client sent "1.2.3.4"; the front end appended the real peer.
    expect(await seenIp(1, '1.2.3.4, 198.51.100.20')).toBe('198.51.100.20');
  });
});
