import { describe, expect, it } from 'vitest';

import { contentSecurityPolicy } from './csp';

/** Pulls one directive out of the assembled single-line policy. */
function directive(policy: string, name: string): string | undefined {
  return policy
    .split(';')
    .map((part) => part.trim())
    .find((part) => part === name || part.startsWith(`${name} `));
}

describe('contentSecurityPolicy', () => {
  /**
   * The regression this exists for. `connect-src` was a hardcoded
   * `http://localhost:8080`, which is right only on a developer's machine: a
   * deployment whose bundle calls a real API domain would have had every
   * browser request blocked by the policy, while the API itself looked
   * perfectly healthy from the outside.
   */
  it('names the configured API origin, not a hardcoded local one', () => {
    const policy = contentSecurityPolicy('https://api.torfun.example');

    expect(directive(policy, 'connect-src')).toBe("connect-src 'self' https://api.torfun.example");
    expect(policy).not.toContain('localhost');
  });

  /** A CSP source is an origin; a path on it is not a valid source expression. */
  it('reduces a configured URL to its origin', () => {
    const policy = contentSecurityPolicy('https://api.torfun.example/v1/');

    expect(directive(policy, 'connect-src')).toBe("connect-src 'self' https://api.torfun.example");
  });

  it('keeps a non-default port, which is the whole point locally', () => {
    const policy = contentSecurityPolicy('http://localhost:8080');

    expect(directive(policy, 'connect-src')).toBe("connect-src 'self' http://localhost:8080");
  });

  /** Turbopack's dev runtime evaluates generated code; a build never should. */
  it("allows 'unsafe-eval' only in development", () => {
    expect(directive(contentSecurityPolicy('http://localhost:8080', { dev: true }), 'script-src')) //
      .toContain("'unsafe-eval'");
    expect(directive(contentSecurityPolicy('http://localhost:8080'), 'script-src')) //
      .not.toContain("'unsafe-eval'");
  });

  it('keeps the rest of the OWASP baseline intact', () => {
    const policy = contentSecurityPolicy('http://localhost:8080');

    expect(directive(policy, 'default-src')).toBe("default-src 'self'");
    expect(directive(policy, 'object-src')).toBe("object-src 'none'");
    expect(directive(policy, 'frame-ancestors')).toBe("frame-ancestors 'none'");
    expect(directive(policy, 'base-uri')).toBe("base-uri 'self'");
    expect(directive(policy, 'form-action')).toBe("form-action 'self'");
    expect(directive(policy, 'upgrade-insecure-requests')).toBe('upgrade-insecure-requests');
  });

  /** One line, no stray whitespace — this goes out as a header value. */
  it('assembles to a single line', () => {
    expect(contentSecurityPolicy('http://localhost:8080')).not.toMatch(/\n|\s{2,}/);
  });
});
