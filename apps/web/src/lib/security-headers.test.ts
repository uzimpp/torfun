import { describe, expect, test } from 'vitest';
import nextConfig from '../../next.config';

/**
 * Criterion 13 / ASVS V3.4.1, V3.4.3, V3.4.4, V3.4.5, V3.4.6, V13.4 / threat T-17.
 * The headers every page of the web app is served with, read from the real config.
 */
async function pageHeaders() {
  const rules = await nextConfig.headers!();
  const all = rules.find((rule) => rule.source === '/(.*)') ?? rules[0]!;
  return Object.fromEntries(all.headers.map((h) => [h.key.toLowerCase(), h.value]));
}

describe('web security headers', () => {
  test('hardening headers are set on every route', async () => {
    const h = await pageHeaders();
    expect(h['x-content-type-options']).toBe('nosniff');
    expect(h['x-frame-options']).toBe('DENY');
    expect(h['referrer-policy']).toBe('strict-origin-when-cross-origin');
    expect(h['cross-origin-opener-policy']).toBe('same-origin');
    expect(h['strict-transport-security']).toMatch(/max-age=\d{7,}/);
    expect(h['permissions-policy']).toContain('camera=()');
  });

  test('CSP locks down framing, plugins and base URI', async () => {
    const csp = (await pageHeaders())['content-security-policy']!;
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("base-uri 'none'");
    expect(csp).toContain("form-action 'self'");
    expect(csp).toContain('upgrade-insecure-requests');
  });

  test('CSP never allows wildcard sources or eval in production', async () => {
    const csp = (await pageHeaders())['content-security-policy']!;
    expect(csp).not.toMatch(/(^|[\s;])\*([\s;]|$)/);
    expect(csp).not.toContain("'unsafe-eval'");
    // The PDF is drawn to canvas by pdf.js, so no browser plugin is needed:
    // object-src is 'none', never http(s), blob: or *.
    expect(csp).toMatch(/object-src 'none'(;|$)/);
  });

  // KNOWN GAP (SECURITY.md, #193): script-src still allows 'unsafe-inline' because a nonce
  // CSP would force fully dynamic rendering (see lib/csp.ts). This test pins the gap so
  // removing it is a deliberate, visible change rather than an accident.
  test('documents the remaining script-src unsafe-inline gap', async () => {
    const csp = (await pageHeaders())['content-security-policy']!;
    expect(csp).toContain("script-src 'self' 'unsafe-inline'");
  });

  test('the framework banner is off', () => {
    expect(nextConfig.poweredByHeader).toBe(false);
  });
});
