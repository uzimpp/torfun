import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
    expect(screen.getByTestId('match-score')).toHaveTextContent('0%');
    expect(screen.getByText('คะแนนคุณสมบัติโดยประมาณ')).toBeInTheDocument();
    expect(screen.getByText('อยู่นอกช่วงงบประมาณที่บริษัทยื่น')).toBeInTheDocument();
  });

  test('no range set shows no rule at all', () => {
    render(<TorQualificationResults qualifications={[clause]} result={result(null)} />);
    expect(screen.queryByText(/ช่วงงบประมาณที่บริษัทยื่น/)).not.toBeInTheDocument();
  });
});

describe('TorQualificationResults reasons', () => {
  const missing = (
    reason: 'setup_certificates' | 'certificate_expired',
  ): QualificationMatchResult => ({
    projectId: 'p',
    companyId: 'c',
    computedAt: new Date(0),
    overallScore: reason === 'certificate_expired' ? 0 : null,
    checks: [
      {
        status: reason === 'certificate_expired' ? 'not_met' : 'unknown',
        reason,
        evidence: ['ISO 27001 · หมดอายุ'],
      },
    ],
    budgetRule: null,
  });

  test('a company with nothing recorded is told what to set up, with a way there', () => {
    render(
      <TorQualificationResults qualifications={[clause]} result={missing('setup_certificates')} />,
    );
    expect(screen.getByTestId('match-score')).toHaveTextContent('—');
    expect(screen.getByText('ยังให้คะแนนไม่ได้ ต้องบันทึก: ใบรับรองบริษัท')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /ใบรับรองบริษัท/ })).toHaveAttribute(
      'href',
      '/company#certificates',
    );
  });

  test('a clause that cost the score is open, and says why', () => {
    render(
      <TorQualificationResults qualifications={[clause]} result={missing('certificate_expired')} />,
    );
    expect(screen.getByText('ไม่ตรงเงื่อนไข 1 จาก 1 ข้อ')).toBeInTheDocument();
    expect(screen.getByText('หากต่ออายุแล้ว ให้อัปเดตวันหมดอายุในข้อมูลบริษัท')).toBeVisible();
  });

  test('an unanswered clause stays closed until opened', async () => {
    render(
      <TorQualificationResults qualifications={[clause]} result={missing('setup_certificates')} />,
    );
    const trigger = screen.getByRole('button', { name: /ISO 27001/ });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('link', { name: /ตั้งค่าใบรับรองบริษัท/ })).toBeVisible();
  });
});
