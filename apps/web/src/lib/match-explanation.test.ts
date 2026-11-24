import { describe, expect, test } from 'vitest';
import type { QualificationSummary } from '@torfun/types';
import { describeMatch } from './match-explanation';

const summary = (overrides: Partial<QualificationSummary>): QualificationSummary => ({
  total: 3,
  met: 0,
  notMet: 0,
  needsSetup: 0,
  needsReview: 0,
  budgetOutsideRange: false,
  setupSections: [],
  ...overrides,
});

describe('describeMatch', () => {
  test('says nothing when there were no clauses to check', () => {
    expect(describeMatch(null, null)).toBeNull();
    expect(describeMatch(null, summary({ total: 0 }))).toBeNull();
  });

  test('a 0% is a disqualification and says which kind', () => {
    expect(describeMatch(0, summary({ notMet: 1, met: 2 }))).toEqual({
      tone: 'bad',
      headline: 'ไม่ตรงเงื่อนไข 1 จาก 3 ข้อ',
    });
    expect(describeMatch(0, summary({ met: 3, budgetOutsideRange: true }))?.headline).toBe(
      'งบประมาณอยู่นอกช่วงที่บริษัทยื่น',
    );
  });

  test('no score because the company has set nothing up names what to set up', () => {
    expect(
      describeMatch(null, summary({ needsSetup: 3, setupSections: ['experience', 'capital'] })),
    ).toEqual({ tone: 'setup', headline: 'ยังให้คะแนนไม่ได้ ต้องบันทึก: ผลงาน · ทุนจดทะเบียน' });
  });

  test('a partial score says what is still unanswered', () => {
    expect(describeMatch(1 / 3, summary({ met: 1, needsReview: 2 }))?.headline).toBe(
      'ตรง 1 จาก 3 ข้อ ต้องตรวจเอง 2 ข้อ',
    );
  });

  test('everything met says so', () => {
    expect(describeMatch(1, summary({ met: 3 }))).toEqual({
      tone: 'good',
      headline: 'ตรงเงื่อนไขครบทั้ง 3 ข้อ',
    });
  });
});
