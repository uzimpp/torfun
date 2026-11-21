import { z } from 'zod';
import {
  EvaluationMethod,
  EvaluationSubCriterionSchema,
  type Evaluation,
  type EvaluationCriterion,
  type EvaluationDocument,
} from '@torfun/types';
import { looksLikePdf, MAX_INLINE_PDF_BYTES, type ModelCall } from './classify-document';
import { EVALUATION_PROMPT, EVALUATION_PROMPT_VERSION } from './prompts/evaluation';

/**
 * Reads how the winner is chosen off a document: a small call of its own,
 * separate from the verdict, so that a failure here costs a project nothing but
 * this one field (#143). Modelled on `invitation-reader.ts`.
 *
 * Conservative by design: anything the model says that does not fit the schema
 * makes the whole reading unreadable rather than keeping part of it, because a
 * partial list of weights reads as a complete one. Nothing is repaired,
 * converted or guessed.
 */

const ModelCriterion = EvaluationSubCriterionSchema.extend({
  children: z.array(EvaluationSubCriterionSchema).max(10).nullish(),
});

const Answer = z.object({
  method: EvaluationMethod.nullable(),
  quote: z.string().nullable(),
  source: z.string().nullable(),
  criteria: z.array(ModelCriterion).max(20),
});

export interface EvaluationReading {
  /**
   * What the document says; `method: null` with no criteria is a document that
   * was read and said nothing about it. Null only when it could not be read.
   */
  evaluation: Evaluation | null;
  /** Set when the document could not be read at all; the reason why. */
  unreadable?: string;
}

function unreadable(reason: string): EvaluationReading {
  return { evaluation: null, unreadable: reason };
}

/** Text the model may cut short without losing a verdict: trimmed, empty means absent, then capped. */
function text(value: string | null, max: number): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

export async function readEvaluationPdf(
  callModel: ModelCall,
  pdf: Buffer,
  document: EvaluationDocument,
): Promise<EvaluationReading> {
  if (!looksLikePdf(pdf)) {
    return unreadable('Bytes are not a PDF — no %PDF header, whatever the extension claims.');
  }
  if (pdf.byteLength > MAX_INLINE_PDF_BYTES) {
    return unreadable('Document is over the 15MB Gemini accepts inline.');
  }

  let raw: string;
  try {
    raw = await callModel({
      pdfBase64: pdf.toString('base64'),
      prompt: EVALUATION_PROMPT,
      answer: 'evaluation',
    });
  } catch (error) {
    return unreadable(error instanceof Error ? error.message : String(error));
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return unreadable(`Model did not return JSON: ${raw.slice(0, 200)}`);
  }

  const answer = Answer.safeParse(parsed);
  if (!answer.success) {
    return unreadable(
      `Model answer did not match the schema: ${answer.error.message.slice(0, 200)}`,
    );
  }

  const criteria: EvaluationCriterion[] = [];
  for (const { children, ...criterion } of answer.data.criteria) {
    const parts = children ?? [];
    for (const part of [criterion, ...parts]) {
      // A share of more than 100 percent is not a share; a misread, so nothing is kept.
      if (part.unit === 'percent' && part.weight !== null && part.weight > 100) {
        return unreadable('A criterion has a percentage above 100.');
      }
    }
    criteria.push(parts.length > 0 ? { ...criterion, children: parts } : criterion);
  }

  return {
    evaluation: {
      method: answer.data.method,
      quote: text(answer.data.quote, 300),
      source: text(answer.data.source, 200),
      document,
      criteria,
      promptVersion: EVALUATION_PROMPT_VERSION,
    },
  };
}
