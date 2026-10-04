import type { IngestionOutcome, Procurement, User } from '@torfun/types';

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

/**
 * The one outcome an officer may see, and the only place it is named. Writing it
 * is narrower than reading it: only `decideOutcome` and an administrator's approval do.
 */
export const OFFICER_VISIBLE_OUTCOME = 'tor_analysed' as const satisfies IngestionOutcome;

export function isVisibleTo(audience: Audience, procurement: Procurement): boolean {
  return audience === 'admin' || procurement.outcome === OFFICER_VISIBLE_OUTCOME;
}

/**
 * A record as this audience is shown it. Who approved a record and why one was
 * held are an administrator's business: an officer gets the same record with
 * those fields emptied, so no colleague's name or review note reaches them.
 * Apply it wherever a record leaves a service for a caller with an audience.
 */
export function presentTo(audience: Audience, procurement: Procurement): Procurement {
  if (audience === 'admin') return procurement;
  return { ...procurement, holdReason: null, approvedBy: null, approvedAt: null };
}
