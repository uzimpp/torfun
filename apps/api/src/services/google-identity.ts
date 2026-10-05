import { UnauthorizedError } from '../core/errors';

/** The subset of Google's userinfo response the app actually consumes. */
export interface GoogleProfile {
  sub: string;
  email: string;
  name?: string;
  given_name?: string;
  family_name?: string;
  picture?: string;
}

const USERINFO_URL = 'https://www.googleapis.com/oauth2/v3/userinfo';

/** Exchanges a Google access token for the signed-in user's profile. */
export async function fetchGoogleProfile(accessToken: string): Promise<GoogleProfile> {
  const response = await fetch(USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    throw new UnauthorizedError('Unable to retrieve Google user information');
  }

  return (await response.json()) as GoogleProfile;
}

/**
 * Google supplies `given_name`/`family_name` for most accounts but not all —
 * single-name accounts and some Workspace configurations only return `name`.
 * Split on the first space so the required name fields always get a value.
 */
export function splitGoogleName(profile: GoogleProfile): { firstName: string; lastName: string } {
  if (profile.given_name) {
    return { firstName: profile.given_name, lastName: profile.family_name ?? '' };
  }

  const parts = (profile.name ?? profile.email.split('@')[0] ?? '').trim().split(/\s+/);
  return { firstName: parts[0] ?? '', lastName: parts.slice(1).join(' ') };
}
