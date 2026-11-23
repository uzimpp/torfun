import { render, screen } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import type { Evaluation } from '@torfun/types';

import { TorEvaluationCriteria } from './tor-evaluation-criteria';

// Fixtures only. The wording is illustrative: no real TOR or invitation was available.
const reading = (overrides: Partial<Evaluation> = {}): Evaluation => ({
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
        { name: 'แผนการดำเนินงาน', weight: 45, unit: 'percent' },
        { name: 'ประสบการณ์', weight: 25, unit: 'percent' },
      ],
    },
  ],
  promptVersion: 'test',
  ...overrides,
});

describe('TorEvaluationCriteria', () => {
  test('says it was never read, and does not claim an AI reading, when there is no evaluation', () => {
    render(<TorEvaluationCriteria evaluation={undefined} />);

    expect(screen.getByText('ยังไม่มีข้อมูลวิธีพิจารณาผู้ชนะ')).toBeInTheDocument();
    expect(screen.queryByText(/AI อ่านวิธีพิจารณา/)).not.toBeInTheDocument();
  });

  test('shows the method, weights as written, the pointer, the quote and the verify note', () => {
    render(<TorEvaluationCriteria evaluation={reading()} />);

    expect(screen.getByText('เกณฑ์ราคาประกอบเกณฑ์อื่น')).toBeInTheDocument();
    expect(screen.getByText('อ้างอิง ประกาศเชิญชวน · ข้อ 8 หน้า 12')).toBeInTheDocument();
    expect(
      screen.getByText('ข้อความในเอกสาร: “พิจารณาโดยใช้เกณฑ์ราคาประกอบเกณฑ์อื่น”'),
    ).toBeInTheDocument();
    expect(screen.getByText('30%')).toBeInTheDocument();
    expect(screen.getByText('70%')).toBeInTheDocument();
    expect(screen.getByText(/แผนการดำเนินงาน/)).toBeInTheDocument();
    expect(screen.getByText('45%')).toBeInTheDocument();
    expect(screen.getByText(/AI อ่านวิธีพิจารณาผู้ชนะจากประกาศเชิญชวน/)).toBeInTheDocument();
    expect(screen.getByText(/โปรดตรวจเงื่อนไขในเอกสารต้นฉบับ/)).toBeInTheDocument();
    expect(screen.getByText('น้ำหนักรวม 100%')).toBeInTheDocument();
    expect(screen.queryByText(/ไม่เท่ากับ 100%/)).not.toBeInTheDocument();
  });

  test('flags weights that do not add up to 100 percent and does not correct them', () => {
    render(
      <TorEvaluationCriteria
        evaluation={reading({
          criteria: [
            { name: 'ราคา', weight: 30, unit: 'percent' },
            { name: 'เทคนิค', weight: 60, unit: 'percent' },
          ],
        })}
      />,
    );

    expect(screen.getByText('30%')).toBeInTheDocument();
    expect(screen.getByText('60%')).toBeInTheDocument();
    expect(screen.getByText(/น้ำหนักรวม 90% ไม่เท่ากับ 100%/)).toBeInTheDocument();
  });

  test('points stay points and are not held to 100', () => {
    render(
      <TorEvaluationCriteria
        evaluation={reading({
          criteria: [
            { name: 'คุณภาพ', weight: 80, unit: 'points' },
            { name: 'ราคา', weight: 15, unit: 'points' },
          ],
        })}
      />,
    );

    expect(screen.getByText('80 คะแนน')).toBeInTheDocument();
    expect(screen.getByText('น้ำหนักรวม 95 คะแนน')).toBeInTheDocument();
    expect(screen.queryByText(/ไม่เท่ากับ 100%/)).not.toBeInTheDocument();
  });

  test('flags a group whose parts do not add up to the group', () => {
    render(
      <TorEvaluationCriteria
        evaluation={reading({
          criteria: [
            {
              name: 'ด้านเทคนิค',
              weight: 70,
              unit: 'percent',
              children: [{ name: 'แผนการดำเนินงาน', weight: 40, unit: 'percent' }],
            },
          ],
        })}
      />,
    );

    expect(
      screen.getByText(/เกณฑ์ย่อยรวมกัน 40% ไม่เท่ากับน้ำหนักของเกณฑ์นี้/),
    ).toBeInTheDocument();
  });

  test('an unknown weight shows nothing, and no total is worked out', () => {
    render(
      <TorEvaluationCriteria
        evaluation={reading({ criteria: [{ name: 'ราคา', weight: null, unit: null }] })}
      />,
    );

    expect(screen.getByText('1. ราคา')).toBeInTheDocument();
    expect(screen.queryByText(/ไม่ระบุน้ำหนัก/)).not.toBeInTheDocument();
    expect(screen.queryByText(/น้ำหนักรวม/)).not.toBeInTheDocument();
  });

  test('price only is listed as "1. ราคาต่ำสุด" with no weight and no AI-did-not-find line', () => {
    render(
      <TorEvaluationCriteria
        evaluation={reading({ method: 'lowest_price', quote: null, criteria: [] })}
      />,
    );

    expect(screen.getByText('เกณฑ์ราคา')).toBeInTheDocument();
    expect(screen.getByText('1. ราคาต่ำสุด')).toBeInTheDocument();
    expect(screen.queryByText(/%/)).not.toBeInTheDocument();
    expect(screen.queryByText(/ไม่พบเกณฑ์พร้อมน้ำหนัก/)).not.toBeInTheDocument();
    expect(screen.queryByText(/น้ำหนักรวม/)).not.toBeInTheDocument();
    expect(screen.getByText(/อ้างอิง ประกาศเชิญชวน/)).toBeInTheDocument();
  });

  test('criteria are numbered, with the weight in brackets after the name, in the unit written', () => {
    render(
      <TorEvaluationCriteria
        evaluation={reading({
          criteria: [
            { name: 'ราคา', weight: 30, unit: 'percent' },
            { name: 'เทคนิค', weight: 60, unit: 'points' },
            { name: 'ประสบการณ์', weight: 10, unit: null },
          ],
        })}
      />,
    );

    const items = screen.getAllByRole('listitem');
    expect(items[0]).toHaveTextContent('1. ราคา (30%)');
    expect(items[1]).toHaveTextContent('2. เทคนิค (60 คะแนน)');
    expect(items[2]).toHaveTextContent('3. ประสบการณ์ (10 (ไม่ระบุหน่วย))');
  });

  test('parts are numbered under their criterion', () => {
    render(<TorEvaluationCriteria evaluation={reading()} />);

    const items = screen.getAllByRole('listitem');
    expect(items.some((item) => item.textContent === '2.1 แผนการดำเนินงาน (45%)')).toBe(true);
    expect(items.some((item) => item.textContent === '2.2 ประสบการณ์ (25%)')).toBe(true);
  });

  test('a method other than price with no criteria keeps the "AI did not find" line', () => {
    render(
      <TorEvaluationCriteria
        evaluation={reading({ method: 'price_performance', quote: null, criteria: [] })}
      />,
    );

    expect(
      screen.getByText('เอกสารระบุวิธีพิจารณา แต่ AI ไม่พบเกณฑ์พร้อมน้ำหนัก'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/ราคาต่ำสุด/)).not.toBeInTheDocument();
  });

  test('a document that was read and said nothing is not the same as one never read', () => {
    render(
      <TorEvaluationCriteria
        evaluation={reading({ method: null, quote: null, source: null, criteria: [] })}
      />,
    );

    expect(screen.getByText('เอกสารไม่ระบุวิธีพิจารณาผู้ชนะ')).toBeInTheDocument();
    expect(screen.getByText('AI ไม่พบวิธีพิจารณาผู้ชนะในเอกสารนี้')).toBeInTheDocument();
    expect(screen.queryByText('ยังไม่มีข้อมูลวิธีพิจารณาผู้ชนะ')).not.toBeInTheDocument();
    expect(screen.getByText('อ่านจากประกาศเชิญชวน (ไม่ระบุตำแหน่ง)')).toBeInTheDocument();
  });

  test('names the document the reading came from', () => {
    render(<TorEvaluationCriteria evaluation={reading({ document: 'tor' })} />);

    expect(screen.getByText('อ้างอิง TOR · ข้อ 8 หน้า 12')).toBeInTheDocument();
    expect(screen.getByText(/AI อ่านวิธีพิจารณาผู้ชนะจาก TOR/)).toBeInTheDocument();
  });
});
