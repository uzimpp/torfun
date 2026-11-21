import { describe, expect, mock, test } from 'bun:test';
import { MAX_INLINE_PDF_BYTES, type ModelCall } from './classify-document';
import { readEvaluationPdf } from './evaluation-reader';
import { EVALUATION_PROMPT_VERSION } from './prompts/evaluation';

// Fixtures only. The wording is illustrative: no real TOR or invitation was available.
const pdf = (bytes = 1_000) =>
  Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(Math.max(0, bytes - 9), 0x20)]);

const answering = (body: unknown): ModelCall => mock(async () => JSON.stringify(body));

const priceOnly = { method: 'lowest_price', quote: 'ใช้เกณฑ์ราคา', source: 'ข้อ 5', criteria: [] };

const weighted = {
  method: 'price_performance',
  quote: 'ใช้เกณฑ์ราคาประกอบเกณฑ์อื่น',
  source: 'ข้อ 8 หน้า 12',
  criteria: [
    { name: 'ราคา', weight: 30, unit: 'percent', children: [] },
    {
      name: 'ด้านเทคนิค',
      weight: 70,
      unit: 'percent',
      children: [
        { name: 'แผนงาน', weight: 40, unit: 'percent' },
        { name: 'ประสบการณ์', weight: 30, unit: 'percent' },
      ],
    },
  ],
};

describe('readEvaluationPdf', () => {
  test('reads a price-only method with no criteria', async () => {
    const { evaluation, unreadable } = await readEvaluationPdf(
      answering(priceOnly),
      pdf(),
      'invitation',
    );

    expect(unreadable).toBeUndefined();
    expect(evaluation).toEqual({
      method: 'lowest_price',
      quote: 'ใช้เกณฑ์ราคา',
      source: 'ข้อ 5',
      document: 'invitation',
      criteria: [],
      promptVersion: EVALUATION_PROMPT_VERSION,
    });
  });

  test('reads weights as written, with one level of children and no empty children key', async () => {
    const { evaluation } = await readEvaluationPdf(answering(weighted), pdf(), 'tor');

    expect(evaluation?.method).toBe('price_performance');
    expect(evaluation?.document).toBe('tor');
    expect(evaluation?.criteria[0]).toEqual({ name: 'ราคา', weight: 30, unit: 'percent' });
    expect(evaluation?.criteria[0]).not.toHaveProperty('children');
    expect(evaluation?.criteria[1]?.children).toEqual([
      { name: 'แผนงาน', weight: 40, unit: 'percent' },
      { name: 'ประสบการณ์', weight: 30, unit: 'percent' },
    ]);
  });

  test('points stay points, and weights that do not add up are not corrected', async () => {
    const { evaluation } = await readEvaluationPdf(
      answering({
        ...weighted,
        criteria: [
          { name: 'คุณภาพ', weight: 80, unit: 'points', children: [] },
          { name: 'ราคา', weight: 15, unit: 'points', children: [] },
        ],
      }),
      pdf(),
      'invitation',
    );

    expect(evaluation?.criteria.map((c) => [c.weight, c.unit])).toEqual([
      [80, 'points'],
      [15, 'points'],
    ]);
  });

  test('a method with unknown weights keeps them null', async () => {
    const { evaluation } = await readEvaluationPdf(
      answering({
        ...weighted,
        criteria: [{ name: 'ราคา', weight: null, unit: null, children: [] }],
      }),
      pdf(),
      'invitation',
    );

    expect(evaluation?.criteria).toEqual([{ name: 'ราคา', weight: null, unit: null }]);
  });

  test('a document that says nothing is a reading, not a failure', async () => {
    const { evaluation, unreadable } = await readEvaluationPdf(
      answering({ method: null, quote: null, source: null, criteria: [] }),
      pdf(),
      'invitation',
    );

    expect(unreadable).toBeUndefined();
    expect(evaluation).toMatchObject({ method: null, quote: null, source: null, criteria: [] });
  });

  test('cuts an over-long quote and source short, and treats blanks as absent', async () => {
    const { evaluation } = await readEvaluationPdf(
      answering({ ...priceOnly, quote: 'ก'.repeat(500), source: '   ' }),
      pdf(),
      'invitation',
    );

    expect(evaluation?.quote).toHaveLength(300);
    expect(evaluation?.source).toBeNull();
  });

  test('asks for the evaluation schema, with the PDF', async () => {
    const callModel = answering(priceOnly);
    await readEvaluationPdf(callModel, pdf(), 'invitation');

    const call = (callModel as ReturnType<typeof mock>).mock
      .calls[0]![0] as Parameters<ModelCall>[0];
    expect(call.answer).toBe('evaluation');
    expect(call.pdfBase64).toBe(pdf().toString('base64'));
    expect(call.prompt).toContain('ห้ามเดา');
  });

  test('bytes that are not a PDF are unreadable and the model is not called', async () => {
    const callModel = answering({});
    const result = await readEvaluationPdf(callModel, Buffer.from('<html>no</html>'), 'tor');

    expect(result.evaluation).toBeNull();
    expect(result.unreadable).toContain('%PDF');
    expect(callModel).not.toHaveBeenCalled();
  });

  test('a PDF over the inline limit is unreadable and the model is not called', async () => {
    const callModel = answering({});
    const result = await readEvaluationPdf(callModel, pdf(MAX_INLINE_PDF_BYTES + 1), 'tor');

    expect(result.unreadable).toContain('15MB');
    expect(callModel).not.toHaveBeenCalled();
  });

  test('a failed call, non-JSON or a wrong shape is unreadable with the reason', async () => {
    const failing: ModelCall = async () => {
      throw new Error('503 busy');
    };
    expect((await readEvaluationPdf(failing, pdf(), 'tor')).unreadable).toBe('503 busy');
    expect((await readEvaluationPdf(async () => 'nope', pdf(), 'tor')).unreadable).toContain(
      'JSON',
    );
    expect(
      (await readEvaluationPdf(answering({ ...priceOnly, method: 'cheapest' }), pdf(), 'tor'))
        .unreadable,
    ).toContain('schema');
    expect(
      (await readEvaluationPdf(answering({ method: null }), pdf(), 'tor')).unreadable,
    ).toContain('schema');
  });

  test('one bad criterion makes the whole reading unreadable, not a partial list', async () => {
    const result = await readEvaluationPdf(
      answering({
        ...weighted,
        criteria: [
          { name: 'ราคา', weight: 30, unit: 'percent', children: [] },
          { name: 'เทคนิค', weight: -5, unit: 'percent', children: [] },
        ],
      }),
      pdf(),
      'tor',
    );

    expect(result.evaluation).toBeNull();
    expect(result.unreadable).toContain('schema');
  });

  test('a percentage above 100 is a misread, so nothing is kept', async () => {
    const result = await readEvaluationPdf(
      answering({
        ...weighted,
        criteria: [{ name: 'ราคา', weight: 130, unit: 'percent', children: [] }],
      }),
      pdf(),
      'tor',
    );

    expect(result.evaluation).toBeNull();
    expect(result.unreadable).toContain('100');
  });

  test('more than 20 criteria is unreadable rather than cut', async () => {
    const many = Array.from({ length: 21 }, (_, i) => ({
      name: `c${i}`,
      weight: 1,
      unit: 'points',
      children: [],
    }));
    const result = await readEvaluationPdf(
      answering({ ...weighted, criteria: many }),
      pdf(),
      'tor',
    );

    expect(result.evaluation).toBeNull();
  });
});
