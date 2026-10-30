import {
  SOFTWARE_REASON_MAX_CHARS,
  SoftwareJudgementSchema,
  TorAnalysisSchema,
  type SoftwareJudgement,
  type TorAnalysis,
} from '@torfun/types';
import { convertDateToISO } from '../egp/dates';
import { z } from 'zod';
import { TOR_PROMPT, TOR_PROMPT_VERSION } from './prompts/tor-analysis';

/**
 * Asks Gemini what one PDF from an announcement Archive actually is.
 *
 * One document per call, because the bytes are not stored (ADR-0002) and so
 * must travel as base64 `inlineData`; several PDFs in one request body would
 * breach the size limit. The consequence is that this function can never
 * compare candidates — it reports on the document in front of it, and
 * `assignDocumentRoles` decides between them afterwards.
 *
 * The model call is a parameter rather than a client so this stays testable
 * without a network or a Google credential.
 */

/** Sends the request and returns the model's raw text. */
export type ModelCall = (parts: {
  /** The document itself, as base64 — the normal case. */
  pdfBase64?: string;
  /** Text taken from a document too large to send as a PDF, instead of `pdfBase64`. */
  text?: string;
  prompt: string;
  /** Which answer shape the model is held to; the TOR's unless said otherwise. */
  answer?: 'tor' | 'invitation';
}) => Promise<string>;

/**
 * Gemini caps a document file at 15MB. Base64 inflates bytes by about a third,
 * and without an object store there is no `gs://` fallback for anything larger
 * — so an oversized TOR is recorded as unreadable rather than silently skipped.
 */
export const MAX_INLINE_PDF_BYTES = 15 * 1024 * 1024;

/** A cut-down copy is aimed below the limit, not at it: the real cap has margins this one cannot see. */
export const OVERSIZE_TARGET_BYTES = 14 * 1024 * 1024;

/**
 * How a document over the limit can still be read. Injected so the choice and
 * its order are testable without a PDF library; the real ones are in
 * `oversize-readers.ts`.
 */
export interface OversizeReaders {
  /** The document's text layer, or null when it has none or it is unreadable. */
  extractText(pdf: Buffer): Promise<string | null>;
  /** A copy of the first pages that fits in `maxBytes`, or null if none can be made. */
  firstPages(
    pdf: Buffer,
    maxBytes: number,
  ): Promise<{ pdf: Buffer; pages: number; totalPages: number } | null>;
}

/** What the model was actually given: the PDF, its text, or its first pages. */
export type ReadMode = 'pdf' | 'text' | 'first_pages';

/**
 * The model answers with its software judgement inside the analysis. The stored
 * analysis keeps only the reason (ADR-0016): the flags travel beside it as
 * `judgement`, to be turned into an Outcome and not kept.
 */
const AnswerAnalysis = TorAnalysisSchema.omit({ reason: true, promptVersion: true }).extend({
  ...SoftwareJudgementSchema.shape,
  // The length is asked for in the prompt and enforced below by cutting, not by
  // refusing: a reason a few characters over is no cause to lose the whole read.
  reason: z.string(),
});

const AnswerSchema = z.object({
  isTor: z.boolean(),
  torKind: z.enum(['final', 'draft']).nullable(),
  whatThisIs: z.string(),
  analysis: AnswerAnalysis.nullable(),
});

export interface DocumentClassification {
  isTor: boolean;
  torKind: 'final' | 'draft' | null;
  whatThisIs: string;
  analysis: TorAnalysis | null;
  /** What the model concluded about the work; null exactly when `analysis` is. */
  judgement: SoftwareJudgement | null;
  /** Set when the document could not be read at all; the reason why. */
  unreadable?: string;
  /** How the model was given the document; anything but `pdf` is a partial reading. */
  readMode?: ReadMode;
  /** For a partial reading, what was lost — shown beside the document so a person checks the source. */
  readNote?: string;
}

/** A PDF really starts with %PDF; an extension is not proof of anything. */
export function looksLikePdf(bytes: Buffer): boolean {
  return (
    bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46 // %PDF
  );
}

function unusable(reason: string): DocumentClassification {
  return {
    isTor: false,
    torKind: null,
    whatThisIs: '',
    analysis: null,
    judgement: null,
    unreadable: reason,
  };
}

interface ModelInput {
  parts: { pdfBase64?: string; text?: string };
  readMode: ReadMode;
  readNote?: string;
}

/**
 * The runtime guard for a document over the limit: use its text layer if it has
 * one, else the first pages cut down to fit, else nothing. Each step that fails
 * or throws is simply unavailable, so one broken reader cannot sink a document
 * the next could have read.
 */
async function oversizeInput(pdf: Buffer, readers: OversizeReaders): Promise<ModelInput | null> {
  try {
    const text = await readers.extractText(pdf);
    if (text) {
      return {
        parts: { text },
        readMode: 'text',
        readNote:
          'อ่านจากข้อความที่ดึงได้จากไฟล์ขนาดใหญ่ (ไม่รวมภาพและตาราง) — โปรดตรวจสอบกับต้นฉบับ',
      };
    }
  } catch {
    // fall through to the next reader
  }

  try {
    const cut = await readers.firstPages(pdf, OVERSIZE_TARGET_BYTES);
    if (cut) {
      return {
        parts: { pdfBase64: cut.pdf.toString('base64') },
        readMode: 'first_pages',
        readNote: `อ่านเฉพาะ ${cut.pages} หน้าแรกจากทั้งหมด ${cut.totalPages} หน้า — โปรดตรวจสอบส่วนที่เหลือกับต้นฉบับ`,
      };
    }
  } catch {
    // nothing left to try
  }

  return null;
}

export async function classifyTorDocument(
  callModel: ModelCall,
  pdf: Buffer,
  readers?: OversizeReaders,
): Promise<DocumentClassification> {
  if (!looksLikePdf(pdf)) {
    return unusable('Bytes are not a PDF — no %PDF header, whatever the extension claims.');
  }

  let input: ModelInput = { parts: { pdfBase64: pdf.toString('base64') }, readMode: 'pdf' };

  if (pdf.byteLength > MAX_INLINE_PDF_BYTES) {
    const fallback = readers ? await oversizeInput(pdf, readers) : null;
    if (!fallback) {
      return unusable(
        `Document is ${Math.round(pdf.byteLength / 1024 / 1024)}MB; Gemini accepts at most 15MB inline, no text layer could be read from it, and its first pages could not be cut to fit (no object store is available).`,
      );
    }
    input = fallback;
  }

  let raw: string;
  try {
    raw = await callModel({ ...input.parts, prompt: TOR_PROMPT });
  } catch (error) {
    return unusable(error instanceof Error ? error.message : String(error));
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return unusable(`Model did not return JSON: ${raw.slice(0, 200)}`);
  }

  const answer = AnswerSchema.safeParse(parsed);
  if (!answer.success) {
    return unusable(`Model answer did not match the schema: ${answer.error.message.slice(0, 200)}`);
  }

  // A document claimed as a TOR with nothing read out of it is of no use to an
  // officer, and would otherwise become a main_tor with an empty analysis.
  if (answer.data.isTor && answer.data.analysis === null) {
    return unusable('Model reported a TOR but returned no analysis.');
  }

  // Stored as ISO so a deadline range filter can compare it; a deadline the
  // model wrote in prose ("within 30 days") has no calendar date and becomes null.
  const { analysis } = answer.data;
  let stored: TorAnalysis | null = null;
  let judgement: SoftwareJudgement | null = null;
  if (analysis) {
    const { isSoftware, confidence, ...fields } = analysis;
    const reason = fields.reason.slice(0, SOFTWARE_REASON_MAX_CHARS);
    judgement = { isSoftware, confidence, reason };
    stored = {
      ...fields,
      reason,
      deadlineAt: convertDateToISO(fields.deadlineAt),
      promptVersion: TOR_PROMPT_VERSION,
    };
  }

  return {
    ...answer.data,
    analysis: stored,
    judgement,
    readMode: input.readMode,
    ...(input.readNote ? { readNote: input.readNote } : {}),
  };
}
