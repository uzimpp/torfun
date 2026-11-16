import { describe, expect, test } from 'bun:test';
import type { CompanyQualificationsRecord, Experience, TorQualification } from '@torfun/types';
import { evaluateQualifications } from './qualification-match';

const profile: CompanyQualificationsRecord = {
  companyId: 'company',
  revision: null,
  registeredCapitalThb: null,
  certificates: [
    { name: 'Quality', standard: 'ISO 9001', issuer: 'Issuer', validUntil: '2026-11-04' },
  ],
  personnel: [],
};
const certificate: TorQualification = {
  kind: 'company_certificate',
  manualReviewReason: null,
  standard: 'ISO 9001',
  issuer: null,
  text: 'ISO 9001',
  source: '4.1',
};
const work: TorQualification = {
  kind: 'past_work',
  manualReviewReason: null,
  workType: 'Web development',
  minValueThb: 100_000,
  text: 'Relevant work',
  source: '4.2',
};
const experience: Experience = {
  id: 'work-1',
  companyId: 'company',
  clientId: 'client',
  projectName: 'Service portal',
  description: null,
  techStack: [],
  targetPlatforms: [],
  durationMonths: null,
  durationUnit: null,
  createdAt: new Date(0),
  updatedAt: new Date(0),
};

describe('qualification evidence', () => {
  test('an organization certificate is valid through its Bangkok expiry day', () => {
    expect(evaluateQualifications([certificate], profile, [], '2026-11-04').overallScore).toBe(1);
    const after = evaluateQualifications([certificate], profile, [], '2026-11-05');
    expect(after.overallScore).toBe(0);
    expect(after.checks[0]).toMatchObject({
      status: 'not_met',
      evidence: expect.arrayContaining([expect.stringContaining('2026-11-04')]),
    });
  });

  test('does not combine type and value from different projects or treat legacy blanks as a failure', () => {
    const relevant = { ...experience, workType: 'web development', contractValueThb: 50_000 };
    const unrelated = {
      ...experience,
      id: 'work-2',
      workType: 'Mobile',
      contractValueThb: 200_000,
    };
    const score = (records: Experience[]) =>
      evaluateQualifications([work], profile, records, '2026-11-04').overallScore;
    expect(score([relevant, unrelated])).toBe(0);
    expect(score([relevant, unrelated, experience])).toBeNull();
    expect(score([{ ...relevant, contractValueThb: 100_000 }])).toBe(1);
  });

  test('does not award points for a project count the personnel roster cannot prove', () => {
    const requirement = {
      kind: 'personnel',
      role: 'Project Manager',
      headcount: 1,
      degree: null,
      minYears: 5,
      certificates: [],
      text: 'มีประสบการณ์เป็นผู้จัดการโครงการด้านสารสนเทศไม่น้อยกว่า ๒ โครงการ ในระยะ ๕ ปีที่ผ่านมา',
      source: 'ข้อ ๔.๓ หน้า ๔',
    } satisfies TorQualification;
    const company = {
      ...profile,
      personnel: [
        { role: 'Project Manager', yearsOfExperience: 5, degree: null, certificates: [] },
      ],
    };
    const evaluate = (clause: TorQualification) =>
      evaluateQualifications([clause], company, [], '2026-11-04');

    expect(evaluate(requirement).overallScore).toBeNull();
    expect(evaluate({ ...requirement, manualReviewReason: null }).checks[0]?.status).toBe(
      'unknown',
    );

    const manualReviewReason = 'ต้องตรวจว่าบริหารครบสองโครงการในห้าปีที่ผ่านมา';
    expect(evaluate({ ...requirement, manualReviewReason }).checks[0]).toMatchObject({
      status: 'unknown',
      evidence: expect.arrayContaining([manualReviewReason]),
    });
    expect(
      evaluate({
        ...requirement,
        text: 'ผู้จัดการโครงการ 1 คน มีประสบการณ์อย่างน้อย 5 ปี',
        manualReviewReason: null,
      }).overallScore,
    ).toBe(1);
  });

  test('keeps legacy and conditional clauses out of the matched count', () => {
    const capital = {
      kind: 'registered_capital',
      minValueThb: 2_000_000,
      text: 'ทุนขั้นต่ำ 2 ล้านบาท เฉพาะบริษัทที่ยังไม่ได้ยื่นงบ',
      source: 'ข้อ 3.12 หน้า 2',
    } satisfies TorQualification;
    const company = { ...profile, registeredCapitalThb: 3_000_000 };
    const result = evaluateQualifications(
      [
        certificate,
        capital,
        { ...capital, manualReviewReason: 'ต้องตรวจว่าบริษัทได้ยื่นงบแล้วหรือไม่' },
      ],
      company,
      [],
      '2026-11-04',
    );
    expect(result.checks.map((item) => item.status)).toEqual(['met', 'unknown', 'unknown']);
    expect(result.overallScore).toBe(1 / 3);
  });
});
