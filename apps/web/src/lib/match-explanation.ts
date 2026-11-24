import {
  QUALIFICATION_REASONS,
  type CompanySetupSection,
  type QualificationReason,
  type QualificationSummary,
} from '@torfun/types';

/** Where in the company's record each kind of missing information is entered. */
export const SETUP_TARGETS: Record<CompanySetupSection, { label: string; href: string }> = {
  experience: { label: 'ผลงาน', href: '/company#experience' },
  certificates: { label: 'ใบรับรองบริษัท', href: '/company#certificates' },
  personnel: { label: 'บุคลากร', href: '/company#personnel' },
  capital: { label: 'ทุนจดทะเบียน', href: '/company#capital' },
};

/** What a reason means to an officer, and what to do about it. */
export const REASON_COPY: Record<QualificationReason, { title: string; hint: string }> = {
  setup_experience: {
    title: 'ยังไม่ได้บันทึกผลงาน',
    hint: 'เพิ่มผลงาน (ประเภทงานและมูลค่า) แล้วระบบจะตรวจข้อนี้ให้',
  },
  setup_certificates: {
    title: 'ยังไม่ได้บันทึกใบรับรองบริษัท',
    hint: 'เพิ่มใบรับรองพร้อมผู้ออกและวันหมดอายุ แล้วระบบจะตรวจข้อนี้ให้',
  },
  setup_personnel: {
    title: 'ข้อมูลบุคลากรยังไม่ครบ',
    hint: 'เพิ่มตำแหน่ง วุฒิ ประสบการณ์ หรือใบรับรองของบุคลากร แล้วระบบจะตรวจข้อนี้ให้',
  },
  setup_capital: {
    title: 'ยังไม่ได้ระบุทุนจดทะเบียน',
    hint: 'ระบุทุนจดทะเบียนของบริษัท แล้วระบบจะตรวจข้อนี้ให้',
  },
  capital_below: {
    title: 'ทุนจดทะเบียนน้อยกว่าที่กำหนด',
    hint: 'ข้อมูลที่บันทึกไว้ไม่ถึงเกณฑ์ หากข้อมูลผิด ให้แก้ไขในข้อมูลบริษัท',
  },
  certificate_missing: {
    title: 'ไม่มีใบรับรองที่ตรงเงื่อนไข',
    hint: 'ไม่พบใบรับรองตามมาตรฐานและผู้ออกที่ TOR ระบุ หากมีอยู่ ให้เพิ่มในข้อมูลบริษัท',
  },
  certificate_expired: {
    title: 'ใบรับรองหมดอายุแล้ว',
    hint: 'หากต่ออายุแล้ว ให้อัปเดตวันหมดอายุในข้อมูลบริษัท',
  },
  experience_missing: {
    title: 'ไม่มีผลงานที่ตรงเงื่อนไข',
    hint: 'ไม่พบผลงานตามประเภทและมูลค่าที่ TOR ระบุ หากมีอยู่ ให้เพิ่มหรือแก้ไขผลงาน',
  },
  personnel_short: {
    title: 'บุคลากรไม่ครบตามที่กำหนด',
    hint: 'จำนวนคนที่ตรงเงื่อนไขน้อยกว่าที่ TOR ต้องการ หากข้อมูลไม่ครบ ให้อัปเดตรายชื่อ',
  },
  budget_outside_range: {
    title: 'งบประมาณอยู่นอกช่วงที่บริษัทยื่น',
    hint: 'ช่วงนี้ตั้งไว้ในข้อมูลบริษัท ปรับได้หากต้องการพิจารณางานขนาดนี้',
  },
  manual_review: {
    title: 'ต้องตรวจในเอกสารต้นฉบับ',
    hint: 'ระบบตัดสินข้อนี้เองไม่ได้ โปรดอ่านเงื่อนไขใน TOR',
  },
  budget_not_announced: {
    title: 'TOR ไม่ได้ประกาศงบประมาณ',
    hint: 'จึงเทียบกับช่วงงบประมาณที่บริษัทยื่นไม่ได้',
  },
};

export function setupTargetFor(reason: QualificationReason | undefined) {
  const section = reason ? QUALIFICATION_REASONS[reason].section : null;
  const kind = reason ? QUALIFICATION_REASONS[reason].kind : null;
  return kind !== 'review' && section ? { section, ...SETUP_TARGETS[section] } : null;
}

export type MatchTone = 'good' | 'bad' | 'setup' | 'review';

/**
 * One line that says why the score is what it is. A score of 0 is always a
 * disqualification, so it never reads as "no data"; a missing score is named
 * for what is missing.
 */
export function describeMatch(
  score: number | null | undefined,
  summary: QualificationSummary | null | undefined,
): { tone: MatchTone; headline: string } | null {
  if (!summary || summary.total === 0) return null;
  if (summary.notMet > 0) {
    const budget = summary.budgetOutsideRange ? ' และงบประมาณอยู่นอกช่วงที่บริษัทยื่น' : '';
    return {
      tone: 'bad',
      headline: `ไม่ตรงเงื่อนไข ${summary.notMet} จาก ${summary.total} ข้อ${budget}`,
    };
  }
  if (summary.budgetOutsideRange) {
    return { tone: 'bad', headline: 'งบประมาณอยู่นอกช่วงที่บริษัทยื่น' };
  }
  if (summary.needsSetup > 0) {
    const names = summary.setupSections.map((section) => SETUP_TARGETS[section].label).join(' · ');
    return {
      tone: 'setup',
      headline:
        score == null
          ? `ยังให้คะแนนไม่ได้ ต้องบันทึก: ${names}`
          : `ตรง ${summary.met} จาก ${summary.total} ข้อ ยังไม่ได้บันทึก: ${names}`,
    };
  }
  if (summary.needsReview > 0) {
    return {
      tone: 'review',
      headline:
        score == null
          ? `ต้องตรวจเอง ${summary.needsReview} ข้อในเอกสารต้นฉบับ`
          : `ตรง ${summary.met} จาก ${summary.total} ข้อ ต้องตรวจเอง ${summary.needsReview} ข้อ`,
    };
  }
  return { tone: 'good', headline: `ตรงเงื่อนไขครบทั้ง ${summary.total} ข้อ` };
}
