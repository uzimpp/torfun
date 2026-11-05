import {
  certificateExpired,
  type CompanyQualificationsRecord,
  type Experience,
  type PersonnelQualification,
  type QualificationCheck,
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
  ...evidence: string[]
): QualificationCheck => ({ status, evidence });
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
  if (!experiences.length) return check('unknown', noEvidence);
  if (workType === null && minValueThb === null) {
    return check('unknown', 'ต้องตรวจรายละเอียดผลงานตามข้อกำหนดใน TOR');
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
  if (proven) return check('met', evidence(proven));
  if (candidates.length) {
    return check(
      'unknown',
      'ประเภทหรือมูลค่าผลงานยังไม่ครบ',
      ...candidates.slice(0, 3).map(evidence),
    );
  }
  return check(
    'not_met',
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
    return check('unknown', manualReview, requirement.manualReviewReason);
  }
  if (requirement.kind === 'manual') return check('unknown', manualReview);
  if (requirement.kind === 'personnel' && personnelProjectCount.test(requirement.text)) {
    return check('unknown', 'ต้องตรวจจำนวนโครงการของบุคลากรจากเอกสารต้นฉบับ');
  }
  if (requirement.manualReviewReason === undefined) {
    return check('unknown', 'ยังไม่ทราบว่าข้อมูลที่สกัดครอบคลุมทุกเงื่อนไข โปรดตรวจเอกสารต้นฉบับ');
  }

  switch (requirement.kind) {
    case 'past_work':
      return pastWork(requirement, experiences);
    case 'registered_capital': {
      const capital = profile.registeredCapitalThb;
      return capital === null
        ? check('unknown', noEvidence)
        : check(
            recorded(capital >= requirement.minValueThb),
            `ทุนจดทะเบียน ${thb.format(capital)}`,
          );
    }
    case 'company_certificate': {
      if (!profile.certificates.length) return check('unknown', noEvidence);
      const relevant = profile.certificates.filter(
        (certificate) =>
          standardKey(certificate.standard) === standardKey(requirement.standard) &&
          (requirement.issuer === null ||
            normalized(certificate.issuer) === normalized(requirement.issuer)),
      );
      const active = relevant.find((certificate) => !certificateExpired(certificate, today));
      const evidence = (certificate: (typeof relevant)[number]) =>
        `${certificate.name} · ${certificate.standard} · ${certificate.issuer} · ${certificate.validUntil}`;
      if (active) return check('met', evidence(active));
      return relevant.length
        ? check(
            'not_met',
            'ใบรับรองที่ตรงเงื่อนไขหมดอายุแล้ว',
            ...relevant.slice(0, 3).map(evidence),
          )
        : check('not_met', 'ไม่มีใบรับรองบริษัทที่บันทึกไว้ตรงตามมาตรฐานและผู้ออกที่ระบุ');
    }
    case 'personnel': {
      if (!profile.personnel.length) return check('unknown', noEvidence);
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
      return check(status, summary, ...evidence);
    }
  }
}

export function evaluateQualifications(
  qualifications: TorQualification[],
  profile: CompanyQualificationsRecord,
  experiences: Experience[],
  today: string,
): { checks: QualificationCheck[]; overallScore: number | null } {
  const checks = qualifications.map((requirement) =>
    compare(requirement, profile, experiences, today),
  );
  // Unknowns never earn points. All-unknown and empty TORs have no score to rank.
  const overallScore = checks.some((item) => item.status !== 'unknown')
    ? checks.filter((item) => item.status === 'met').length / checks.length
    : null;
  return { checks, overallScore };
}

export function computeQualificationMatch(
  projectId: string,
  qualifications: TorQualification[],
  profile: CompanyQualificationsRecord,
  experiences: Experience[],
  today: string,
  now: Date,
): QualificationMatchResult {
  return {
    projectId,
    companyId: profile.companyId,
    computedAt: now,
    ...evaluateQualifications(qualifications, profile, experiences, today),
  };
}
