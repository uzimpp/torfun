import { render, screen } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import type { QualificationMatchResult, TorQualification } from '@torfun/types';
import { TorQualificationResults } from './tor-qualification-results';

const clause: TorQualification = {
  kind: 'company_certificate',
  manualReviewReason: null,
  standard: 'ISO 27001',
  issuer: null,
  text: 'ISO 27001',
  source: 'ข้อ 1',
};
const result = (budgetRule: QualificationMatchResult['budgetRule']): QualificationMatchResult => ({
  projectId: 'p',
  companyId: 'c',
  computedAt: new Date(0),
  overallScore: budgetRule?.status === 'not_met' ? 0 : 1,
  checks: [{ status: 'met', evidence: ['ISO 27001'] }],
  budgetRule,
});

describe('TorQualificationResults price rule', () => {
  test('a budget outside the company range is flagged beside the 0% score', () => {
    render(
      <TorQualificationResults
        qualifications={[clause]}
        result={result({
          status: 'not_met',
          evidence: [
            'งบประมาณโครงการ ฿500,000.00',
            'ช่วงงบประมาณที่บริษัทยื่น ฿1,000,000.00 – ไม่กำหนด',
          ],
        })}
      />,
    );
    expect(screen.getByText('คะแนนคุณสมบัติโดยประมาณ 0%')).toBeInTheDocument();
    expect(screen.getByText('อยู่นอกช่วงงบประมาณที่บริษัทยื่น')).toBeInTheDocument();
  });

  test('no range set shows no rule at all', () => {
    render(<TorQualificationResults qualifications={[clause]} result={result(null)} />);
    expect(screen.queryByText(/ช่วงงบประมาณที่บริษัทยื่น/)).not.toBeInTheDocument();
  });
});
