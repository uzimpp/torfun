import type { Evaluation, EvaluationDocument } from '@torfun/types';
import type { EvaluationReading } from '../vertex/evaluation-reader';
import type { ExtractedPdf, InvitationPdfs } from './tor-package';

/**
 * Reads how the winner is chosen (#143) from an archive's documents, as a step
 * of its own after the verdict: it adds a field to the analysis and never changes
 * the outcome, so a failure here costs nothing but that field.
 *
 * UNVALIDATED ASSUMPTION (no real sample was available): the invitation
 * announcement, small and present in every stored archive, is where the method
 * and weights are stated, so it is read first; the bidding document stands in
 * when there is no invitation. The main TOR is read only if the first document
 * gave no method. At most two calls per project.
 */

export interface EvaluationSources {
  extract: (archive: Uint8Array, projectId: string) => InvitationPdfs;
  read: (pdf: Buffer, document: EvaluationDocument) => Promise<EvaluationReading>;
}

export interface EvaluationResult {
  /** The reading to keep; null when no document could be read at all. */
  evaluation: Evaluation | null;
  /** One line per document that could not be read, for the failure log. */
  unreadable: string[];
}

export async function readEvaluationDocuments(
  sources: EvaluationSources,
  archive: Uint8Array,
  projectId: string,
  /** The main TOR, only when it was read whole; null otherwise. */
  mainTor: ExtractedPdf | null,
): Promise<EvaluationResult> {
  const { invitation, biddingDocument } = sources.extract(archive, projectId);
  const candidates: Array<[ExtractedPdf, EvaluationDocument]> = [];
  if (invitation) candidates.push([invitation, 'invitation']);
  else if (biddingDocument) candidates.push([biddingDocument, 'bidding_document']);
  if (mainTor) candidates.push([mainTor, 'tor']);

  const unreadable: string[] = [];
  /** A document that was read and said nothing: kept if no later one states a method. */
  let silent: Evaluation | null = null;
  for (const [file, document] of candidates) {
    const reading = await sources.read(
      // A view over the extracted bytes, not a copy.
      Buffer.from(file.payload.buffer, file.payload.byteOffset, file.payload.byteLength),
      document,
    );
    if (reading.evaluation === null) {
      unreadable.push(`${file.filename}: ${reading.unreadable ?? 'no reading'}`);
      continue;
    }
    if (reading.evaluation.method !== null) return { evaluation: reading.evaluation, unreadable };
    silent ??= reading.evaluation;
  }
  return { evaluation: silent, unreadable };
}
