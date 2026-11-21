import { describe, expect, test } from 'bun:test';
import { EvaluationSchema, EvaluationMethod, type Evaluation } from './evaluation';
import { ProcurementListQuerySchema, TorAnalysisSchema } from './egp';

// Fixtures only. The wording is illustrative: no real TOR or invitation was available.
const reading: Evaluation = {
  method: 'price_performance',
  quote: 'พิจารณาโดยใช้เกณฑ์ราคาประกอบเกณฑ์อื่น',
  source: 'ข้อ 8 หน้า 12',
  document: 'invitation',
  criteria: [
    { name: 'ราคา', weight: 30, unit: 'percent' },
    {
      name: 'ด้านเทคนิค',
      weight: 70,
      unit: 'percent',
      children: [
        { name: 'แผนการดำเนินงาน', weight: 40, unit: 'percent' },
        { name: 'ประสบการณ์', weight: 30, unit: 'percent' },
      ],
    },
  ],
  promptVersion: 'evaluation-test',
};

const analysis = {
  summary: 's',
  scopeOfWork: [],
  budgetThb: null,
  deadlineAt: null,
  durationDays: null,
  techStack: [],
  targetPlatforms: [],
  requiredQualifications: [],
};

describe('EvaluationSchema', () => {
  test('accepts weights as written, in percent or points, with one level of children', () => {
    expect(EvaluationSchema.parse(reading)).toEqual(reading);
    const points = {
      ...reading,
      criteria: [{ name: 'คุณภาพ', weight: 80, unit: 'points' }],
    };
    expect(EvaluationSchema.parse(points).criteria[0]?.unit).toBe('points');
  });

  test('a document that states no method is a reading with a null method and no criteria', () => {
    const none = { ...reading, method: null, quote: null, source: null, criteria: [] };
    expect(EvaluationSchema.parse(none).method).toBeNull();
  });

  test('a weight may be unknown, and so may its unit', () => {
    const open = { ...reading, criteria: [{ name: 'ราคา', weight: null, unit: null }] };
    expect(EvaluationSchema.parse(open).criteria[0]?.weight).toBeNull();
  });

  test('rejects an unknown method, a negative weight, a third nesting level and oversize text', () => {
    expect(EvaluationSchema.safeParse({ ...reading, method: 'cheapest' }).success).toBe(false);
    expect(
      EvaluationSchema.safeParse({
        ...reading,
        criteria: [{ name: 'x', weight: -1, unit: 'percent' }],
      }).success,
    ).toBe(false);
    // A third level is not kept: only one level of children exists in the schema.
    const deep = EvaluationSchema.parse({
      ...reading,
      criteria: [
        {
          name: 'a',
          weight: 1,
          unit: 'percent',
          children: [{ name: 'b', weight: 1, unit: 'percent', children: [{ name: 'c' }] }],
        },
      ],
    });
    expect(deep.criteria[0]?.children?.[0]).toEqual({ name: 'b', weight: 1, unit: 'percent' });
    expect(EvaluationSchema.safeParse({ ...reading, quote: 'x'.repeat(301) }).success).toBe(false);
    expect(EvaluationSchema.safeParse({ ...reading, source: 'x'.repeat(201) }).success).toBe(false);
    expect(
      EvaluationSchema.safeParse({ ...reading, criteria: Array(21).fill(reading.criteria[0]) })
        .success,
    ).toBe(false);
  });

  test('a document is always named', () => {
    const { document: _omitted, ...incomplete } = reading;
    expect(EvaluationSchema.safeParse(incomplete).success).toBe(false);
  });
});

describe('TorAnalysisSchema.evaluation', () => {
  test('is optional, so analyses stored before it existed still parse', () => {
    expect(TorAnalysisSchema.parse(analysis).evaluation).toBeUndefined();
    expect(TorAnalysisSchema.parse({ ...analysis, evaluation: reading }).evaluation?.method).toBe(
      'price_performance',
    );
  });
});

describe('ProcurementListQuerySchema.evaluationMethod', () => {
  test('takes repeated or comma-separated methods and rejects unknown ones', () => {
    expect(
      ProcurementListQuerySchema.parse({ evaluationMethod: 'lowest_price,other' }).evaluationMethod,
    ).toEqual(['lowest_price', 'other']);
    expect(
      ProcurementListQuerySchema.parse({ evaluationMethod: ['price_performance'] })
        .evaluationMethod,
    ).toEqual(['price_performance']);
    expect(ProcurementListQuerySchema.safeParse({ evaluationMethod: 'cheapest' }).success).toBe(
      false,
    );
    expect(ProcurementListQuerySchema.parse({}).evaluationMethod).toBeUndefined();
    expect(EvaluationMethod.options).toEqual(['lowest_price', 'price_performance', 'other']);
  });
});
