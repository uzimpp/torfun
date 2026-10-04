import type { DeadlineSource, Procurement } from '@torfun/types';

/**
 * The bid deadline an officer sees, and the one place it is decided.
 *
 * Several documents can state a deadline and they do not carry equal weight: the
 * bidding date e-GP itself records beats the one printed on the invitation, which
 * beats the one a TOR happens to mention. Whichever source wins is kept beside
 * the date, so a person can tell how far to trust it.
 */

export interface DeadlineReading {
  at: string;
  source: DeadlineSource;
}

export type StoredDeadline = Pick<Procurement, 'deadlineAt' | 'deadlineSource'>;

/** Higher wins. */
const RANK: Record<DeadlineSource, number> = { timeline: 3, invitation: 2, tor: 1 };

export interface DeadlineReadings {
  /** When bidding happened, as the timeline dates it; null until it has. */
  priced: string | null;
  invitationBidAt: string | null;
  torDeadline: string | null;
}

function best(readings: DeadlineReadings): DeadlineReading | null {
  if (readings.priced) return { at: readings.priced, source: 'timeline' };
  if (readings.invitationBidAt) return { at: readings.invitationBidAt, source: 'invitation' };
  if (readings.torDeadline) return { at: readings.torDeadline, source: 'tor' };
  return null;
}

/**
 * The deadline to store: the best of this pass's readings, unless what is stored
 * came from a higher-ranked source. Equal rank replaces, so a re-dated invitation
 * is followed, while a weaker document read later (a retry that reaches the TOR
 * first) cannot undo a better one.
 */
export function decideDeadline(stored: StoredDeadline, readings: DeadlineReadings): StoredDeadline {
  const reading = best(readings);
  const outranked =
    reading === null ||
    (stored.deadlineSource !== null && RANK[reading.source] < RANK[stored.deadlineSource]);
  return outranked
    ? { deadlineAt: stored.deadlineAt, deadlineSource: stored.deadlineSource }
    : { deadlineAt: reading.at, deadlineSource: reading.source };
}
