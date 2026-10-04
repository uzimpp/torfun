import { z } from 'zod';
import { convertDateToISO } from '../egp/dates';
import { looksLikePdf, MAX_INLINE_PDF_BYTES, type ModelCall } from './classify-document';
import { INVITATION_PROMPT } from './prompts/invitation';

/**
 * Reads the bid date off an invitation announcement (ประกาศเชิญชวน): a small call
 * of its own, separate from reading a TOR, because the document and the question
 * differ.
 */

const Answer = z.object({ bidDate: z.string().nullable() });

export interface InvitationReading {
  /** When bids are due; null where the document states none (a blank draft, say). */
  bidAt: string | null;
  /** Set when the document could not be read at all; the reason why. */
  unreadable?: string;
}

function unreadable(reason: string): InvitationReading {
  return { bidAt: null, unreadable: reason };
}

export async function readInvitationPdf(
  callModel: ModelCall,
  pdf: Buffer,
): Promise<InvitationReading> {
  if (!looksLikePdf(pdf)) {
    return unreadable('Bytes are not a PDF — no %PDF header, whatever the extension claims.');
  }
  if (pdf.byteLength > MAX_INLINE_PDF_BYTES) {
    return unreadable('Invitation is over the 15MB Gemini accepts inline.');
  }

  let raw: string;
  try {
    raw = await callModel({
      pdfBase64: pdf.toString('base64'),
      prompt: INVITATION_PROMPT,
      answer: 'invitation',
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

  return { bidAt: convertDateToISO(answer.data.bidDate) };
}
