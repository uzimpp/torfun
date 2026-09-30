import { describe, expect, test } from 'bun:test';
import { ModelStatus } from './classify-document';
import { ANSWER_SCHEMA, contentParts, textFromResponse } from './vertex-ai';

/**
 * The request schema and the zod schema that validates the reply are written
 * twice. This keeps them from drifting on the one list that is easy to get
 * wrong: which stages the model may answer with.
 */
describe('ANSWER_SCHEMA', () => {
  test('offers the model exactly the stages the reply validator accepts, or null', () => {
    const field = ANSWER_SCHEMA.properties?.procurementStatus;

    expect(field?.enum).toEqual([...ModelStatus.options]);
    expect(field?.nullable).toBe(true);
    expect(ANSWER_SCHEMA.required).toContain('procurementStatus');
  });
});

/**
 * `gemini-3.5-flash` is a thinking model, and its thinking tokens are spent
 * from the same `maxOutputTokens` budget as the answer. A budget that runs out
 * mid-thought returns finishReason MAX_TOKENS with empty text — which, left
 * alone, reaches the classifier as "the model did not return JSON" and blames
 * the model for a setting.
 */
describe('textFromResponse', () => {
  test('returns the answer when the model finished', () => {
    expect(
      textFromResponse({ text: '{"isTor":true}', candidates: [{ finishReason: 'STOP' }] }),
    ).toBe('{"isTor":true}');
  });

  test('a truncated answer names the budget, not the model', () => {
    expect(() =>
      textFromResponse({ text: '{"isTor":tr', candidates: [{ finishReason: 'MAX_TOKENS' }] }),
    ).toThrow(/maxOutputTokens/);
  });

  test('thinking that consumed the whole budget is reported as such', () => {
    expect(() =>
      textFromResponse({
        text: '',
        candidates: [{ finishReason: 'MAX_TOKENS' }],
        usageMetadata: { thoughtsTokenCount: 4096 },
      }),
    ).toThrow(/thinking/i);
  });

  test('a safety block is distinguished from an empty answer', () => {
    expect(() => textFromResponse({ text: '', candidates: [{ finishReason: 'SAFETY' }] })).toThrow(
      /SAFETY/,
    );
  });

  test('no candidates at all is reported rather than returning empty', () => {
    expect(() => textFromResponse({ candidates: [] })).toThrow(/no candidates/i);
  });
});

describe('contentParts', () => {
  test('a PDF goes as inline data, followed by the prompt', () => {
    const parts = contentParts({ pdfBase64: 'QUJD', prompt: 'classify this' });

    expect(parts).toEqual([
      { inlineData: { mimeType: 'application/pdf', data: 'QUJD' } },
      { text: 'classify this' },
    ]);
  });

  test('extracted text goes as text, with no inline data, and says it is extracted', () => {
    const parts = contentParts({ text: 'ขอบเขตของงาน', prompt: 'classify this' });

    expect(parts).toHaveLength(3);
    expect(parts.some((part) => 'inlineData' in part)).toBe(false);
    expect(parts[0]).toEqual({ text: expect.stringContaining('ถูกดึงจากเอกสาร PDF') });
    expect(parts[1]).toEqual({ text: 'ขอบเขตของงาน' });
    expect(parts[2]).toEqual({ text: 'classify this' });
  });
});
