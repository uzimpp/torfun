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
  standard: 'ISO 9001',
  issuer: null,
  text: 'ISO 9001',
  source: '4.1',
};
const work: TorQualification = {
  kind: 'past_work',
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
});
