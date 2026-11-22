import type { Stages } from '@torfun/types';

/**
 * The official bid deadline, and the one place it is decided.
 *
 * Two of e-GP's own records can date it, and they do not carry equal weight:
 * the bidding date the timeline records beats the one printed on the invitation.
 * A date a TOR happens to mention is never official; it stays in the analysis,
 * where `currentDeadline` falls back on it.
 */
export function officialDeadline(
  stored: string | null,
  stages: Stages,
  invitationBidAt: string | null = null,
): string | null {
  return stages.priced ?? invitationBidAt ?? stored;
}
