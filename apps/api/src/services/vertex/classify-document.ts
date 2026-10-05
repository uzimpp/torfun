import { TorAnalysisSchema, type TorAnalysis } from '@torfun/types';
import { z } from 'zod';

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
export type ModelCall = (parts: { pdfBase64: string; prompt: string }) => Promise<string>;

/**
 * Gemini caps a document file at 15MB. Base64 inflates bytes by about a third,
 * and without an object store there is no `gs://` fallback for anything larger
 * — so an oversized TOR is recorded as unreadable rather than silently skipped.
 */
export const MAX_INLINE_PDF_BYTES = 15 * 1024 * 1024;

const AnswerSchema = z.object({
  isTor: z.boolean(),
  torKind: z.enum(['final', 'draft']).nullable(),
  whatThisIs: z.string(),
  analysis: TorAnalysisSchema.nullable(),
});

export interface DocumentClassification {
  isTor: boolean;
  torKind: 'final' | 'draft' | null;
  whatThisIs: string;
  analysis: TorAnalysis | null;
  /** Set when the document could not be read at all; the reason why. */
  unreadable?: string;
}

const PROMPT = `คุณคือผู้ช่วยคัดกรองเอกสารจัดซื้อจัดจ้างภาครัฐไทย
อ่านเอกสาร PDF ที่แนบมาแล้วตอบเป็น JSON เท่านั้น ตามโครงสร้างนี้:

{ "isTor": boolean,
  "torKind": "final" | "draft" | null,
  "whatThisIs": string,
  "analysis": { ... } | null }

- isTor เป็น true เฉพาะเมื่อเอกสารนี้คือขอบเขตของงาน (TOR) จริง ๆ
  เอกสารอื่น เช่น หนังสือรับรอง สัญญา ใบเสนอราคา ประกาศเชิญชวน ให้ตอบ false
  หากไม่ใช่ TOR ให้ตอบ false อย่างตรงไปตรงมา ห้ามเดา
- torKind เป็น "draft" เมื่อเอกสารระบุว่าเป็นร่าง มิฉะนั้นเป็น "final"
- analysis ต้องมีค่าเมื่อ isTor เป็น true และเป็น null เมื่อไม่ใช่ TOR
- ค่าที่ไม่ปรากฏในเอกสารให้เป็น null หรือ [] ห้ามคาดเดา`;

/** A PDF really starts with %PDF; an extension is not proof of anything. */
function looksLikePdf(bytes: Buffer): boolean {
  return (
    bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46 // %PDF
  );
}

function unusable(reason: string): DocumentClassification {
  return { isTor: false, torKind: null, whatThisIs: '', analysis: null, unreadable: reason };
}

export async function classifyTorDocument(
  callModel: ModelCall,
  pdf: Buffer,
): Promise<DocumentClassification> {
  if (pdf.byteLength > MAX_INLINE_PDF_BYTES) {
    return unusable(
      `Document is ${Math.round(pdf.byteLength / 1024 / 1024)}MB; Gemini accepts at most 15MB inline and no object store is available.`,
    );
  }
  if (!looksLikePdf(pdf)) {
    return unusable('Bytes are not a PDF — no %PDF header, whatever the extension claims.');
  }

  let raw: string;
  try {
    raw = await callModel({ pdfBase64: pdf.toString('base64'), prompt: PROMPT });
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

  return answer.data;
}
