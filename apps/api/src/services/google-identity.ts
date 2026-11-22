import { z } from 'zod';
import { UnauthorizedError } from '../core/errors';

/**
 * The subset of Google's userinfo response the app consumes, validated rather
 * than cast: it decides which account a person is signed in to (ASVS V10.4.x,
 * V6.8.x; threat T-14).
 */
const GoogleProfileSchema = z.object({
  sub: z.string().min(1).max(255),
  email: z.string().email().max(254),
  /** Whether Google has confirmed the person controls `email`. */
  email_verified: z.boolean().optional(),
  name: z.string().max(200).optional(),
  given_name: z.string().max(200).optional(),
  family_name: z.string().max(200).optional(),
  picture: z.string().max(2048).optional(),
});

export type GoogleProfile = z.infer<typeof GoogleProfileSchema>;

const USERINFO_URL = 'https://www.googleapis.com/oauth2/v3/userinfo';
const USERINFO_TIMEOUT_MS = 10_000;

/** Exchanges a Google access token for the signed-in user's profile. */
export async function fetchGoogleProfile(accessToken: string): Promise<GoogleProfile> {
  let response: Response;
  try {
    response = await fetch(USERINFO_URL, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(USERINFO_TIMEOUT_MS),
    });
  } catch {
    throw new UnauthorizedError('Unable to retrieve Google user information');
  }

  if (!response.ok) {
    throw new UnauthorizedError('Unable to retrieve Google user information');
  }

  const parsed = GoogleProfileSchema.safeParse(await response.json().catch(() => null));
  if (!parsed.success) throw new UnauthorizedError('Unexpected Google user information');
  return parsed.data;
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
