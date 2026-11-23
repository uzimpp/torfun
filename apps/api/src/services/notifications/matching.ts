import {
  procurementDay,
  thailandDay,
  type CompanyQualificationsRecord,
  type NotificationSettings,
} from '@torfun/types';
import { computeQualificationMatch } from '../qualification-match';
import { isVisibleTo } from '../audience';
import { createHash } from 'node:crypto';
import type { Experience, MatchResult, Procurement } from '@torfun/types';

export const SCORING_VERSION = 'technology-platform-v1';
const normalise = (value: string) => value.normalize('NFKC').trim().toLocaleLowerCase('en-US');

/** A transparent overlap heuristic, not a certification of bid eligibility. */
export function computeMatch(
  companyId: string,
  tor: Procurement,
  experiences: Experience[],
  now = new Date(),
): MatchResult {
  const owned = experiences.filter((item) => item.companyId === companyId);
  const technologies = new Set(owned.flatMap((item) => item.techStack).map(normalise));
  const platforms = new Set(owned.flatMap((item) => item.targetPlatforms));
  const requiredTech = [...new Set((tor.analysis?.techStack ?? []).map(normalise))];
  const requiredPlatforms = [...new Set(tor.analysis?.targetPlatforms ?? [])];
  const matchedTech = requiredTech.filter((term) => technologies.has(term));
  const matchedPlatforms = requiredPlatforms.filter((term) => platforms.has(term));
  const tech = requiredTech.length ? matchedTech.length / requiredTech.length : 0;
  const platform = requiredPlatforms.length
    ? matchedPlatforms.length / requiredPlatforms.length
    : 0;
  // Fixed weights: absent requirements never count as a match or inflate a score.
  const overallScore = Math.round((0.6 * tech + 0.4 * platform) * 10000) / 10000;
  return {
    companyId,
    projectId: tor.projectId,
    overallScore,
    breakdown: {
      techStackScore: tech,
      targetPlatformScore: platform,
      deadlineScore: 0,
      decisionRulesScore: 0,
    },
    reasons: [
      ...(matchedTech.length ? [`เทคโนโลยีที่ตรงกับผลงาน: ${matchedTech.join(', ')}`] : []),
      ...(matchedPlatforms.length
        ? [`แพลตฟอร์มที่ตรงกับผลงาน: ${matchedPlatforms.join(', ')}`]
        : []),
    ],
    unmatched: [
      ...requiredTech.filter((term) => !technologies.has(term)),
      ...requiredPlatforms.filter((term) => !platforms.has(term)),
      'ยังไม่ได้ตรวจสอบคุณสมบัติทางกฎหมาย ประสบการณ์เฉพาะ และกำลังส่งมอบงาน',
    ],
    computedAt: now,
    scoringVersion: SCORING_VERSION,
    inputVersion: createHash('sha256')
      .update(
        JSON.stringify({
          analysis: tor.analysis,
          experiences: owned
            .map((e) => [e.id, e.techStack, e.targetPlatforms])
            .sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
        }),
      )
      .digest('hex'),
  };
}

export function visibleForNotification(tor: Procurement): boolean {
  return Boolean(
    isVisibleTo('officer', tor) &&
    tor.analysis &&
    (tor.approved ||
      (!tor.archive?.torAmbiguous &&
        tor.archive?.documents.some((document) => document.role === 'main_tor'))),
  );
}

export function openForMatch(tor: Procurement, now: Date): boolean {
  if (!visibleForNotification(tor) || tor.timeline.status !== 'open') return false;
  const deadline = tor.timeline.deadlineAt ?? tor.analysis?.deadlineAt;
  if (!deadline) return true;
  if (procurementDay(deadline) === null) return false;
  // Date-only evidence is inclusive in Bangkok; never infer a submission time.
  const at = /^\d{4}-\d{2}-\d{2}$/.test(deadline)
    ? Date.parse(`${deadline}T23:59:59.999+07:00`)
    : Date.parse(deadline);
  return !Number.isNaN(at) && at > now.getTime();
}

export type NotificationMatch = Omit<MatchResult, 'overallScore'> & {
  overallScore: number | null;
  disqualified: boolean;
};

/** Use exactly the same per-clause score as TOR detail and search. */
export function computeNotificationMatch(
  companyId: string,
  tor: Procurement,
  profile: CompanyQualificationsRecord | null,
  experiences: Experience[],
  now = new Date(),
): NotificationMatch {
  const clauses = tor.analysis?.qualifications ?? [];
  const result =
    profile && clauses.length
      ? computeQualificationMatch(
          tor.projectId,
          clauses,
          profile,
          experiences,
          thailandDay(now),
          now,
          tor.projectMoney,
        )
      : null;
  const reasons = clauses.flatMap((clause, i) => {
    const check = result?.checks[i];
    return [
      `${check?.status === 'met' ? 'ตรงเงื่อนไข' : check?.status === 'not_met' ? 'ไม่ตรงเงื่อนไข' : 'ต้องตรวจเพิ่ม'}: ${clause.text}`,
    ];
  });
  return {
    ...computeMatch(companyId, tor, experiences, now),
    overallScore: result?.overallScore ?? null,
    reasons: reasons.length ? reasons : ['ยังไม่มีคุณสมบัติแบบมีโครงสร้าง โปรดตรวจ TOR ต้นฉบับ'],
    unmatched: clauses.filter((_, i) => result?.checks[i]?.status !== 'met').map((c) => c.text),
    disqualified:
      (result?.checks.some((c) => c.status === 'not_met') ||
        result?.budgetRule?.status === 'not_met') ??
      false,
    scoringVersion: 'qualification-clauses-v1',
    inputVersion: createHash('sha256')
      .update(JSON.stringify({ clauses, profile, experiences, today: thailandDay(now) }))
      .digest('hex'),
  };
}

export function passesNotificationFilters(
  tor: Procurement,
  score: number | null,
  filters: NotificationSettings['filters'],
): boolean {
  return (
    (!filters.agencies.length ||
      filters.agencies.includes(tor.deptName) ||
      (tor.deptSubName !== null && filters.agencies.includes(tor.deptSubName))) &&
    (filters.minBudget === null ||
      (tor.projectMoney !== null && tor.projectMoney >= filters.minBudget)) &&
    (filters.maxBudget === null ||
      (tor.projectMoney !== null && tor.projectMoney <= filters.maxBudget)) &&
    (!filters.workTypes.length ||
      filters.workTypes.some((p) => tor.analysis?.targetPlatforms.includes(p))) &&
    (filters.minQualificationScore === null ||
      (score !== null && score >= filters.minQualificationScore))
  );
}
