/** Navigation state only. Never allow arbitrary redirects or change OAuth state/PKCE. */
export const AUTH_RETURN_COOKIE = 'torfun-notification-return';
const ORIGIN = 'https://torfun.invalid';
export function safeAuthReturnPath(value: unknown): string | null {
  if (
    typeof value !== 'string' ||
    value.length > 1800 ||
    !value.startsWith('/') ||
    value.startsWith('//') ||
    /[\\\r\n]/.test(value)
  )
    return null;
  let url: URL;
  try {
    url = new URL(value, ORIGIN);
  } catch {
    return null;
  }
  if (url.origin !== ORIGIN || url.hash) return null;
  if (/^\/tor\/[A-Za-z0-9_-]{1,100}$/.test(url.pathname)) return url.pathname;
  if (url.pathname === '/notifications') {
    const token = url.searchParams.get('verify_email');
    return token && /^[A-Za-z0-9_-]{43}$/.test(token)
      ? `/notifications?${new URLSearchParams({ verify_email: token })}`
      : '/notifications';
  }
  if (url.pathname === '/notifications/link-line') {
    const token = url.searchParams.get('link_token');
    if (!token || token.length > 1000) return null;
    return `/notifications/link-line?${new URLSearchParams({ link_token: token })}`;
  }
  return null;
}
export function requestedAuthReturnPath(): string | null {
  return safeAuthReturnPath(new URLSearchParams(window.location.search).get('next'));
}
export function authReturnCookiePath(value: string | undefined): string | null {
  const direct = safeAuthReturnPath(value);
  if (direct || !value) return direct;
  try {
    return safeAuthReturnPath(decodeURIComponent(value));
  } catch {
    return null;
  }
}

export function clearAuthReturnCookie() {
  document.cookie = `${AUTH_RETURN_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
}
