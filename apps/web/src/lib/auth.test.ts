// @vitest-environment node
// `next/headers` needs a request scope rather than a DOM, and nothing here
// touches one.

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const cookieStore = { get: vi.fn() };
vi.mock('next/headers', () => ({ cookies: async () => cookieStore }));

/**
 * The real `redirect` throws to abort rendering; this one throws a value the
 * test can read, so "where did the officer end up" is what gets asserted rather
 * than "was a function called".
 */
class Redirected extends Error {
  constructor(readonly to: string) {
    super(`redirected to ${to}`);
  }
}
vi.mock('next/navigation', () => ({
  redirect: (to: string) => {
    throw new Redirected(to);
  },
}));

const { COMPANY_PATH, requireCompany } = await import('./auth');

type MeResponse = {
  role: 'admin' | 'business_development_officer';
  company_id: string | null;
  company_name: string | null;
};

function signedInAs(me: MeResponse) {
  cookieStore.get.mockReturnValue({ value: 'a-session' });
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            id: 'u1',
            username: 'somchai',
            first_name: 'Somchai',
            last_name: 'Prasert',
            full_name: 'Somchai Prasert',
            ...me,
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
    ),
  );
}

/** Runs the gate and reports where it sent the caller, or null if it let them through. */
async function destinationOf(gate: () => Promise<unknown>): Promise<string | null> {
  try {
    await gate();
    return null;
  } catch (caught) {
    if (caught instanceof Redirected) return caught.to;
    throw caught;
  }
}

beforeEach(() => {
  cookieStore.get.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('requireCompany', () => {
  test('sends an officer with no company to the page that explains one', async () => {
    signedInAs({
      role: 'business_development_officer',
      company_id: null,
      company_name: null,
    });

    expect(await destinationOf(requireCompany)).toBe(COMPANY_PATH);
    expect(COMPANY_PATH).toBe('/company-experiences');
  });

  test('lets an officer who has a company through, and hands back their session', async () => {
    signedInAs({
      role: 'business_development_officer',
      company_id: 'c1',
      company_name: 'บริษัท ทรู คอร์ปอเรชั่น จำกัด (มหาชน)',
    });

    const user = await requireCompany();

    expect(user.company_id).toBe('c1');
    expect(user.company_name).toBe('บริษัท ทรู คอร์ปอเรชั่น จำกัด (มหาชน)');
  });

  test('exempts an administrator, who has no vendor record to keep', async () => {
    // The ingestion console was never about a company; making an admin invent
    // one to reach it would be nonsense.
    signedInAs({ role: 'admin', company_id: null, company_name: null });

    expect(await destinationOf(requireCompany)).toBeNull();
  });

  test('sends someone with no session to sign in rather than to the company page', async () => {
    cookieStore.get.mockReturnValue(undefined);

    expect(await destinationOf(requireCompany)).toBe('/login');
  });
});
