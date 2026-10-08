import type { Procurement, User } from '@torfun/types';

/**
 * Who is asking, as far as what they may see is concerned.
 *
 * A Business Development Officer decides where to spend days of bid
 * preparation, so they are shown only procurements whose TOR was actually read.
 * A Site Administrator runs the pipeline and needs the whole queue, failures
 * included. Anything that is not an administrator is treated as an officer, so a
 * role added later starts with the narrower view.
 */
export type Audience = 'officer' | 'admin';

export function audienceOf(role: User['role']): Audience {
  return role === 'admin' ? 'admin' : 'officer';
}

/** The one outcome an officer may see. */
export const OFFICER_VISIBLE_OUTCOME = 'tor_analysed' as const;

export function isVisibleTo(audience: Audience, procurement: Procurement): boolean {
  return audience === 'admin' || procurement.outcome === OFFICER_VISIBLE_OUTCOME;
}
