import { expect, test } from '@playwright/test';

/**
 * What the browser is actually told, and whether the page still works under it
 * (ASVS V3.2.1, V3.4.3; threat T-08, T-17). `csp.test.ts` proves the policy
 * string; this proves it is the header a real response carries, and that a
 * real page loads under it without a single violation. Signed-out pages only:
 * the suite runs without an API, so a signed-in TOR preview is out of reach.
 */

const PAGES = ['/', '/login', '/register'];

for (const path of PAGES) {
  test(`${path} is served under the locked-down policy and loads without violations`, async ({
    page,
  }) => {
    const violations: string[] = [];
    page.on('console', (message) => {
      if (/content security policy/i.test(message.text())) violations.push(message.text());
    });
    page.on('pageerror', (error) => violations.push(error.message));

    const response = await page.goto(path);
    await page.waitForLoadState('networkidle');

    const headers = response!.headers();
    const policy = headers['content-security-policy'] ?? '';
    const directives = new Map(
      policy.split(';').map((part) => {
        const [name = '', ...values] = part.trim().split(/\s+/);
        return [name, values.join(' ')] as const;
      }),
    );

    expect(directives.get('object-src')).toBe("'none'");
    expect(directives.get('frame-src')).toBe("'none'");
    expect(directives.get('base-uri')).toBe("'none'");
    expect(directives.get('frame-ancestors')).toBe("'none'");
    expect(directives.get('default-src')).toBe("'self'");
    expect(headers['x-content-type-options']).toBe('nosniff');
    expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
    expect(headers['content-type']).toMatch(/^text\/html;\s*charset=utf-8/i);

    expect(violations).toEqual([]);
  });
}
