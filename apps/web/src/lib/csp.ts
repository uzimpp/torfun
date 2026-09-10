/**
 * The Content-Security-Policy every response is served under — an OWASP secure
 * headers baseline, assembled here rather than in `next.config.ts` so it is
 * reachable from a test.
 *
 * No nonces: they would force fully dynamic rendering. Revisit with a
 * proxy-based nonce CSP if inline scripts grow.
 *
 * `connect-src` has to name the API explicitly, because the API is a separate
 * origin and every browser call to it is therefore a cross-origin connection
 * the policy must allow. That is also the directive to delete first if the
 * browser is ever moved behind a same-origin proxy — at which point `'self'`
 * covers it and this parameter goes away.
 */
export function contentSecurityPolicy(apiUrl: string, { dev = false } = {}): string {
  // A CSP source expression is an origin. Whatever was configured may carry a
  // path (`https://api.example/v1`), which is not a valid source, so reduce it.
  const apiOrigin = new URL(apiUrl).origin;

  return [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self'",
    `connect-src 'self' ${apiOrigin}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    'upgrade-insecure-requests',
  ].join('; ');
}
