import {
  certificateExpired,
  type CompanyQualificationsRecord,
  type Experience,
  type PersonnelQualification,
  type QualificationCheck,
  type QualificationReason,
  type QualificationMatchResult,
  type TorQualification,
} from '@torfun/types';

const thb = new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB' });
const normalized = (text: string) =>
  text.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
const standardKey = (text: string) =>
  normalized(text)
    .replace(/^iso\s*[/ -]\s*iec\s*(?=\d)/, 'iso')
    .replace(/\s+/g, '');
const check = (
  status: QualificationCheck['status'],
  reason: QualificationReason | undefined,
  ...evidence: string[]
): QualificationCheck => ({ status, evidence, ...(reason ? { reason } : {}) });
const recorded = (meets: boolean) => (meets ? 'met' : 'not_met');
const noEvidence = 'ยังไม่มีข้อมูลบริษัทที่ใช้ตรวจเงื่อนไขนี้';
const manualReview = 'ต้องตรวจเงื่อนไขข้อนี้ในเอกสารต้นฉบับ';
// The roster stores years of experience, but has no evidence of a person's project count.
const personnelProjectCount = /[0-9๐-๙]+\s*(?:โครงการ|projects?\b)/iu;

function pastWork(
  requirement: Extract<TorQualification, { kind: 'past_work' }>,
  experiences: Experience[],
) {
  const { workType, minValueThb } = requirement;
  if (!experiences.length) return check('unknown', 'setup_experience', noEvidence);
  if (workType === null && minValueThb === null) {
    return check('unknown', 'manual_review', 'ต้องตรวจรายละเอียดผลงานตามข้อกำหนดใน TOR');
  }
  const eligible = experiences.filter(
    (item) =>
      workType === null ||
      item.workType == null ||
      normalized(item.workType) === normalized(workType),
  );
  const candidates = eligible.filter(
    (item) =>
      minValueThb === null || item.contractValueThb == null || item.contractValueThb >= minValueThb,
  );
  const evidence = (item: Experience) =>
    [
      item.projectName,
      item.workType,
      item.contractValueThb == null ? null : thb.format(item.contractValueThb),
    ]
      .filter(Boolean)
      .join(' · ');
  const proven = candidates.find(
    (item) =>
      (workType === null || item.workType != null) &&
      (minValueThb === null || item.contractValueThb != null),
  );
  if (proven) return check('met', undefined, evidence(proven));
  if (candidates.length) {
    return check(
      'unknown',
      'setup_experience',
      'ประเภทหรือมูลค่าผลงานยังไม่ครบ',
      ...candidates.slice(0, 3).map(evidence),
    );
  }
  return check(
    'not_met',
    'experience_missing',
    'ไม่มีผลงานที่บันทึกไว้ตรงตามประเภทและมูลค่าที่ระบุ',
    ...(eligible.length ? eligible : experiences).slice(0, 3).map(evidence),
  );
}

function personnelStatus(
  requirement: Extract<TorQualification, { kind: 'personnel' }>,
  person: PersonnelQualification,
): QualificationCheck['status'] {
  if (
    requirement.minYears !== null &&
    person.yearsOfExperience !== null &&
    person.yearsOfExperience < requirement.minYears
  )
    return 'not_met';
  if (
    requirement.certificates.length &&
    person.certificates !== null &&
    !requirement.certificates.every((required) =>
      person.certificates?.some((held) => standardKey(required) === standardKey(held)),
    )
  )
    return 'not_met';
  if (
    (requirement.minYears !== null && person.yearsOfExperience === null) ||
    (requirement.degree !== null &&
      (person.degree === null || normalized(person.degree) !== normalized(requirement.degree))) ||
    (requirement.certificates.length && person.certificates === null)
  )
    return 'unknown';
  return 'met';
}

function compare(
  requirement: TorQualification,
  profile: CompanyQualificationsRecord,
  experiences: Experience[],
  today: string,
): QualificationCheck {
  if (requirement.manualReviewReason) {
    return check('unknown', 'manual_review', manualReview, requirement.manualReviewReason);
  }
  if (requirement.kind === 'manual') return check('unknown', 'manual_review', manualReview);
  if (requirement.kind === 'personnel' && personnelProjectCount.test(requirement.text)) {
    return check('unknown', 'manual_review', 'ต้องตรวจจำนวนโครงการของบุคลากรจากเอกสารต้นฉบับ');
  }
  if (requirement.manualReviewReason === undefined) {
    return check(
      'unknown',
      'manual_review',
      'ยังไม่ทราบว่าข้อมูลที่สกัดครอบคลุมทุกเงื่อนไข โปรดตรวจเอกสารต้นฉบับ',
    );
  }

  switch (requirement.kind) {
    case 'past_work':
      return pastWork(requirement, experiences);
    case 'registered_capital': {
      const capital = profile.registeredCapitalThb;
      if (capital === null) return check('unknown', 'setup_capital', noEvidence);
      const enough = capital >= requirement.minValueThb;
      return check(
        recorded(enough),
        enough ? undefined : 'capital_below',
        `ทุนจดทะเบียน ${thb.format(capital)}`,
      );
    }
    case 'company_certificate': {
      if (!profile.certificates.length) return check('unknown', 'setup_certificates', noEvidence);
      const relevant = profile.certificates.filter(
        (certificate) =>
          standardKey(certificate.standard) === standardKey(requirement.standard) &&
          (requirement.issuer === null ||
            normalized(certificate.issuer) === normalized(requirement.issuer)),
      );
      const active = relevant.find((certificate) => !certificateExpired(certificate, today));
      const evidence = (certificate: (typeof relevant)[number]) =>
        `${certificate.name} · ${certificate.standard} · ${certificate.issuer} · ${certificate.validUntil}`;
      if (active) return check('met', undefined, evidence(active));
      return relevant.length
        ? check(
            'not_met',
            'certificate_expired',
            'ใบรับรองที่ตรงเงื่อนไขหมดอายุแล้ว',
            ...relevant.slice(0, 3).map(evidence),
          )
        : check(
            'not_met',
            'certificate_missing',
            'ไม่มีใบรับรองบริษัทที่บันทึกไว้ตรงตามมาตรฐานและผู้ออกที่ระบุ',
          );
    }
    case 'personnel': {
      if (!profile.personnel.length) return check('unknown', 'setup_personnel', noEvidence);
      const candidates = profile.personnel.filter(
        (person) => normalized(person.role) === normalized(requirement.role),
      );
      const statuses = candidates.map((person) => personnelStatus(requirement, person));
      const met = statuses.filter((status) => status === 'met').length;
      const unknown = statuses.filter((status) => status === 'unknown').length;
      const needed = requirement.headcount;
      const summary = `ตรงเงื่อนไข ${met} คน · ต้องตรวจเพิ่ม ${unknown} คน · ต้องการ ${needed ?? 'ไม่ระบุ'} คน`;
      const evidence = candidates.slice(0, 5).map((person, index) => {
        const status = { met: 'ตรงเงื่อนไข', not_met: 'ไม่ตรงเงื่อนไข', unknown: 'ต้องตรวจเพิ่ม' };
        return [
          person.role,
          person.degree,
          person.yearsOfExperience === null ? null : `${person.yearsOfExperience} ปี`,
          person.certificates?.join(', '),
          status[statuses[index]!],
        ]
          .filter(Boolean)
          .join(' · ');
      });
      const status =
        needed === null || (met < needed && met + unknown >= needed)
          ? 'unknown'
          : recorded(met >= needed);
      // Unanswered with no headcount to count against is the TOR's gap; unanswered
      // because the roster lacks a degree, years or certificate is the company's.
      const reason =
        status === 'met'
          ? undefined
          : status === 'not_met'
            ? 'personnel_short'
            : needed === null
              ? 'manual_review'
              : 'setup_personnel';
      return check(status, reason, summary, ...evidence);
    }
  }
}

/**
 * The company's price-based decision rule (FR-29): is the TOR's announced
 * budget inside the range the company bids for? Null when no range is set.
 */
export function checkBudgetRule(
  profile: Pick<CompanyQualificationsRecord, 'bidBudgetMinThb' | 'bidBudgetMaxThb'>,
  budgetThb: number | null | undefined,
): QualificationCheck | null {
  const min = profile.bidBudgetMinThb ?? null;
  const max = profile.bidBudgetMaxThb ?? null;
  if (min === null && max === null) return null;
  const range = `ช่วงงบประมาณที่บริษัทยื่น ${min === null ? 'ไม่กำหนด' : thb.format(min)} – ${
    max === null ? 'ไม่กำหนด' : thb.format(max)
  }`;
  if (budgetThb == null)
    return check('unknown', 'budget_not_announced', 'TOR ไม่ได้ประกาศงบประมาณ', range);
  const inside = (min === null || budgetThb >= min) && (max === null || budgetThb <= max);
  return check(
    recorded(inside),
    inside ? undefined : 'budget_outside_range',
    `งบประมาณโครงการ ${thb.format(budgetThb)}`,
    range,
  );
}

export function evaluateQualifications(
  qualifications: TorQualification[],
  profile: CompanyQualificationsRecord,
  experiences: Experience[],
  today: string,
  budgetThb?: number | null,
): {
  checks: QualificationCheck[];
  overallScore: number | null;
  budgetRule: QualificationCheck | null;
} {
  const checks = qualifications.map((requirement) =>
    compare(requirement, profile, experiences, today),
  );
  const budgetRule = checkBudgetRule(profile, budgetThb);
  // Every bidder qualification in a TOR is mandatory: failing one disqualifies
  // the bid, so a single `not_met` scores 0 however many others pass. A budget
  // outside the company's own range is a decision not to bid and scores 0 too;
  // the rule itself earns no points. Unknowns never earn points. All-unknown
  // and empty TORs have no score to rank.
  const overallScore =
    budgetRule?.status === 'not_met' || checks.some((item) => item.status === 'not_met')
      ? 0
      : checks.some((item) => item.status !== 'unknown')
        ? checks.filter((item) => item.status === 'met').length / checks.length
        : null;
  return { checks, overallScore, budgetRule };
}

export function computeQualificationMatch(
  projectId: string,
  qualifications: TorQualification[],
  profile: CompanyQualificationsRecord,
  experiences: Experience[],
  today: string,
  now: Date,
  budgetThb?: number | null,
): QualificationMatchResult {
  return {
    projectId,
    companyId: profile.companyId,
    computedAt: now,
    ...evaluateQualifications(qualifications, profile, experiences, today, budgetThb),
  };
}
