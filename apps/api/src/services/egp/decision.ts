import type { HoldReason, IngestionOutcome, SoftwareConfidence } from '@torfun/types';
import { OFFICER_VISIBLE_OUTCOME } from '../audience';

/**
 * What the model's judgement does to a record: show it, hold it, or drop it.
 * `drop` has no outcome because a dropped record is deleted, not stored.
 */
export type OutcomeDecision =
  // The outcome officers see, named once in `audience.ts`; only this function and an
  // administrator's approval may write it.
  | { result: 'shown'; outcome: typeof OFFICER_VISIBLE_OUTCOME }
  | {
      result: 'held';
      outcome: Extract<IngestionOutcome, 'needs_review'>;
      holdReason: HoldReason;
    }
  | { result: 'drop' };

/**
 * What a model's judgement is allowed to do to a record.
 *
 * Gemini's reading is a summary, never an authority, so only its most certain
 * answers act on their own:
 *
 *  - shown to officers: software work, said with high confidence, from the
 *    whole document;
 *  - dropped: not software, said with high confidence, from the whole document;
 *  - held for an administrator: everything else, with the reason it was held,
 *    so a person can read the source and decide. A partial read is held whatever
 *    the model said, because it may have missed what was left out.
 *
 * The title plays no part: the document is the only judge.
 */
export function decideOutcome(input: {
  isSoftware: boolean;
  confidence: SoftwareConfidence;
  partialRead: boolean;
}): OutcomeDecision {
  const { isSoftware, confidence, partialRead } = input;

  if (partialRead) return held('partial_read');
  if (confidence === 'low') return held(isSoftware ? 'ai_low_confidence' : 'ai_not_software_low');
  return isSoftware ? { result: 'shown', outcome: OFFICER_VISIBLE_OUTCOME } : { result: 'drop' };
}

function held(holdReason: HoldReason): OutcomeDecision {
  return { result: 'held', outcome: 'needs_review', holdReason };
}
