import { describe, expect, test } from 'bun:test';
import { Type } from '@google/genai';
import {
  ANSWER_SCHEMA,
  contentParts,
  INVITATION_SCHEMA,
  textFromResponse,
  usageFromResponse,
} from './vertex-ai';

describe('INVITATION_SCHEMA', () => {
  test('asks only for the bid date, which may be null', () => {
    const fields = ['bidDate'];

    expect(Object.keys(INVITATION_SCHEMA.properties ?? {})).toEqual(fields);
    expect(INVITATION_SCHEMA.required).toEqual(fields);
    for (const field of fields) {
      expect(INVITATION_SCHEMA.properties?.[field]).toMatchObject({
        type: Type.STRING,
        nullable: true,
      });
    }
  });
});

describe('ANSWER_SCHEMA', () => {
  test('does not ask for the stage of the tender', () => {
    expect(ANSWER_SCHEMA.properties).not.toHaveProperty('procurementStatus');
    expect(ANSWER_SCHEMA.required).not.toContain('procurementStatus');
  });

  test('asks for the software judgement as three required fields of the analysis', () => {
    const analysis = ANSWER_SCHEMA.properties?.analysis;

    expect(analysis?.properties?.isSoftware?.type).toBe(Type.BOOLEAN);
    expect(analysis?.properties?.confidence?.enum).toEqual(['high', 'low']);
    expect(analysis?.properties?.reason?.type).toBe(Type.STRING);
    expect(analysis?.required).toEqual(
      expect.arrayContaining(['isSoftware', 'confidence', 'reason']),
    );
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

describe('usageFromResponse', () => {
  test('reads prompt, answer, thinking and total tokens from the usage metadata', () => {
    expect(
      usageFromResponse({
        usageMetadata: {
          promptTokenCount: 5120,
          candidatesTokenCount: 410,
          thoughtsTokenCount: 980,
          totalTokenCount: 6510,
        },
      }),
    ).toEqual({ prompt: 5120, output: 410, thoughts: 980, total: 6510 });
  });

  test('a count the service left out is zero, not missing', () => {
    expect(
      usageFromResponse({ usageMetadata: { promptTokenCount: 12, totalTokenCount: 15 } }),
    ).toEqual({ prompt: 12, output: 0, thoughts: 0, total: 15 });
    expect(usageFromResponse({})).toEqual({ prompt: 0, output: 0, thoughts: 0, total: 0 });
  });
});
