import { describe, expect, test } from 'bun:test';
import { textFromResponse } from './vertex-ai';

/**
 * `gemini-3.5-flash` is a thinking model, and its thinking tokens are spent
 * from the same `maxOutputTokens` budget as the answer. A budget that runs out
 * mid-thought returns finishReason MAX_TOKENS with empty text — which, left
 * alone, reaches the classifier as "the model did not return JSON" and blames
 * the model for a setting.
 */
describe('textFromResponse', () => {
  test('returns the answer when the model finished', () => {
    expect(textFromResponse({ text: '{"isTor":true}', candidates: [{ finishReason: 'STOP' }] })).toBe(
      '{"isTor":true}',
    );
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
