import { z } from 'zod';

/**
 * How a bid is judged (#143): by price alone, or by price together with other
 * criteria ("price-performance"). `null` on a reading means the document did not
 * say; it is never guessed. `other` is a method the document states that is
 * neither of the two.
 *
 * UNVALIDATED ASSUMPTIONS (no real TOR or invitation sample was available):
 *  - these three values are enough for e-bidding announcements;
 *  - weights are written either as percentages or as points, and are kept exactly
 *    as written, in the unit written, without conversion;
 *  - criteria nest at most one level (a group with sub-criteria).
 * Revisit all three against real documents before relying on them.
 */
export const EvaluationMethod = z.enum(['lowest_price', 'price_performance', 'other']);
export type EvaluationMethod = z.infer<typeof EvaluationMethod>;

export const EvaluationWeightUnit = z.enum(['percent', 'points']);
export type EvaluationWeightUnit = z.infer<typeof EvaluationWeightUnit>;

const name = z.string().trim().min(1).max(200);
/** Same convention as a qualification's `source`: a clause number or a PDF page counted from 1. */
const source = z.string().trim().min(1).max(200);
/** As written in the document; a group may carry points, not only a percentage. */
const weight = z.number().nonnegative().max(10_000);

export const EvaluationSubCriterionSchema = z.object({
  name,
  weight: weight.nullable(),
  unit: EvaluationWeightUnit.nullable(),
});
export type EvaluationSubCriterion = z.infer<typeof EvaluationSubCriterionSchema>;

export const EvaluationCriterionSchema = EvaluationSubCriterionSchema.extend({
  /** One level of nesting at most, such as "technical" with its parts. */
  children: z.array(EvaluationSubCriterionSchema).max(10).optional(),
});
export type EvaluationCriterion = z.infer<typeof EvaluationCriterionSchema>;

/** Which document the evaluation was read from. */
export const EvaluationDocument = z.enum(['invitation', 'tor', 'bidding_document']);
export type EvaluationDocument = z.infer<typeof EvaluationDocument>;

/**
 * What Gemini read about how the winner is chosen. A summary, never an
 * authority: the document stays reachable so an officer can check it before
 * bidding. Absent on analyses from before this was read, or when no readable
 * document was available; present with `method: null` and no criteria means the
 * document was read and did not state a method.
 */
export const EvaluationSchema = z.object({
  method: EvaluationMethod.nullable(),
  /** The passage that states the method, quoted so a person can find it (at most 300 characters). */
  quote: z.string().trim().min(1).max(300).nullable(),
  /** Where the evaluation is described: a clause number or a PDF page. Null when not given. */
  source: source.nullable(),
  document: EvaluationDocument,
  /** Empty when the document names a method but gives no weighted criteria. */
  criteria: z.array(EvaluationCriterionSchema).max(20),
  /** The prompt that produced this reading. */
  promptVersion: z.string(),
});
export type Evaluation = z.infer<typeof EvaluationSchema>;
