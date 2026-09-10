// `||` rather than `??`: an unset build arg or CI variable inlines as an empty
// string, which is not nullish and would otherwise make every API call
// relative to the web app's own origin.
export const api_url = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';

/**
 * The same API, addressed from the server rather than from the browser.
 *
 * These are two different network paths to one service, and under Docker they
 * need two different addresses. The browser reaches the API on the port
 * published to the host (`localhost:8080`); server-side rendering runs *inside*
 * the web container, where `localhost` is that container and nothing is
 * listening on 8080. One value cannot be right for both.
 *
 * `NEXT_PUBLIC_API_URL` alone cannot cover the gap, because Next inlines
 * `NEXT_PUBLIC_*` at build time into the **server** bundle as well as the
 * browser one — the built output holds a literal `fetch("http://localhost:8080
 * /api/auth/me")`, so handing the container a different value at runtime
 * changes nothing. The absence of a `NEXT_PUBLIC_` prefix here is the whole
 * point: it leaves this one read at runtime, where Compose can name the
 * service.
 *
 * Unset — `bun run dev`, or any deployment where both halves share a network —
 * it falls back to the browser's origin, which is then correct for both.
 */
export const internal_api_url = process.env.INTERNAL_API_URL || api_url;
