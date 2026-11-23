import { describe, expect, mock, test } from 'bun:test';
import type { Evaluation } from '@torfun/types';
import type { EvaluationReading } from '../vertex/evaluation-reader';
import { readEvaluationDocuments, type EvaluationSources } from './evaluation';
import type { ExtractedPdf } from './tor-package';

const pdf = (filename: string): ExtractedPdf => ({
  member: filename,
  filename,
  bytes: 10,
  namePattern: 'unlabelled',
  payload: new Uint8Array(Buffer.from('%PDF-1.7\n')),
});

const evaluation = (overrides: Partial<Evaluation> = {}): Evaluation => ({
  method: 'lowest_price',
  quote: null,
  source: null,
  document: 'invitation',
  criteria: [],
  promptVersion: 'test',
  ...overrides,
});

/** `read` answers per document, in the order the module asks. */
function sources(
  files: { invitation?: ExtractedPdf; biddingDocument?: ExtractedPdf },
  readings: Partial<Record<'invitation' | 'bidding_document' | 'tor', EvaluationReading>>,
) {
  const read = mock(async (_pdf: Buffer, document: 'invitation' | 'bidding_document' | 'tor') => {
    return readings[document] ?? { evaluation: null, unreadable: 'not scripted' };
  });
  const value: EvaluationSources = {
    extract: () => ({
      invitation: files.invitation ?? null,
      biddingDocument: files.biddingDocument ?? null,
    }),
    read,
  };
  return { value, read };
}

const tor = pdf('Attach_TOR_1.pdf');
const invitation = pdf('annoudoc_1.pdf');

describe('readEvaluationDocuments', () => {
  test('the invitation is read first, and a stated method ends the search at one call', async () => {
    const { value, read } = sources(
      { invitation },
      { invitation: { evaluation: evaluation({ method: 'price_performance' }) } },
    );

    const result = await readEvaluationDocuments(value, new Uint8Array(), 'p', tor);

    expect(result.evaluation?.method).toBe('price_performance');
    expect(read).toHaveBeenCalledTimes(1);
    expect(read.mock.calls[0]![1]).toBe('invitation');
  });

  test('an invitation that says nothing falls through to the main TOR', async () => {
    const { value, read } = sources(
      { invitation },
      {
        invitation: { evaluation: evaluation({ method: null }) },
        tor: { evaluation: evaluation({ method: 'lowest_price', document: 'tor' }) },
      },
    );

    const result = await readEvaluationDocuments(value, new Uint8Array(), 'p', tor);

    expect(result.evaluation).toMatchObject({ method: 'lowest_price', document: 'tor' });
    expect(read).toHaveBeenCalledTimes(2);
  });

  test('an unreadable invitation is reported, and the main TOR still gets its turn', async () => {
    const { value } = sources(
      { invitation },
      {
        invitation: { evaluation: null, unreadable: '503 busy' },
        tor: { evaluation: evaluation({ document: 'tor' }) },
      },
    );

    const result = await readEvaluationDocuments(value, new Uint8Array(), 'p', tor);

    expect(result.evaluation?.document).toBe('tor');
    expect(result.unreadable).toEqual(['annoudoc_1.pdf: 503 busy']);
  });

  test('when no document states a method, the first reading that said nothing is kept', async () => {
    const { value } = sources(
      { invitation },
      {
        invitation: { evaluation: evaluation({ method: null }) },
        tor: { evaluation: evaluation({ method: null, document: 'tor' }) },
      },
    );

    const result = await readEvaluationDocuments(value, new Uint8Array(), 'p', tor);

    expect(result.evaluation).toMatchObject({ method: null, document: 'invitation' });
  });

  test('nothing readable is no reading, with every reason given', async () => {
    const { value } = sources(
      { invitation },
      {
        invitation: { evaluation: null, unreadable: 'a' },
        tor: { evaluation: null, unreadable: 'b' },
      },
    );

    const result = await readEvaluationDocuments(value, new Uint8Array(), 'p', tor);

    expect(result.evaluation).toBeNull();
    expect(result.unreadable).toEqual(['annoudoc_1.pdf: a', 'Attach_TOR_1.pdf: b']);
  });

  test('the bidding document stands in only when there is no invitation', async () => {
    const bidding = pdf('doc_1_p.pdf');
    const { value, read } = sources(
      { biddingDocument: bidding },
      { bidding_document: { evaluation: evaluation({ document: 'bidding_document' }) } },
    );

    const result = await readEvaluationDocuments(value, new Uint8Array(), 'p', null);

    expect(result.evaluation?.document).toBe('bidding_document');
    expect(read).toHaveBeenCalledTimes(1);

    const both = sources(
      { invitation, biddingDocument: bidding },
      { invitation: { evaluation: evaluation() } },
    );
    await readEvaluationDocuments(both.value, new Uint8Array(), 'p', null);
    expect(both.read.mock.calls.map((call) => call[1])).toEqual(['invitation']);
  });

  test('a main TOR that was not read whole is never asked', async () => {
    const { value, read } = sources(
      { invitation },
      { invitation: { evaluation: evaluation({ method: null }) } },
    );

    const result = await readEvaluationDocuments(value, new Uint8Array(), 'p', null);

    expect(read).toHaveBeenCalledTimes(1);
    expect(result.evaluation?.method).toBeNull();
  });

  test('no documents at all is no reading and no call', async () => {
    const { value, read } = sources({}, {});

    const result = await readEvaluationDocuments(value, new Uint8Array(), 'p', null);

    expect(result).toEqual({ evaluation: null, unreadable: [] });
    expect(read).not.toHaveBeenCalled();
  });

  test('at most two calls per project, however many documents there are', async () => {
    const { value, read } = sources(
      { invitation, biddingDocument: pdf('doc_1_p.pdf') },
      {
        invitation: { evaluation: evaluation({ method: null }) },
        tor: { evaluation: evaluation({ method: null, document: 'tor' }) },
      },
    );

    await readEvaluationDocuments(value, new Uint8Array(), 'p', tor);

    expect(read.mock.calls.length).toBeLessThanOrEqual(2);
  });
});
