import { procurementDay } from '@torfun/types';
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
      industryScore: 0,
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
  return (
    !tor.publicationRemovedAt &&
    tor.eBidding &&
    tor.outcome === 'tor_analysed' &&
    tor.analysis?.isSoftwareProject === true &&
    tor.analysis.confidence === 'high' &&
    !tor.torAmbiguous &&
    tor.documents.some((document) => document.role === 'main_tor')
  );
}

export function openForMatch(tor: Procurement, now: Date): boolean {
  if (!visibleForNotification(tor) || tor.status !== 'invitation' || tor.winner) return false;
  const deadline = tor.analysis?.deadlineAt;
  if (!deadline) return true;
  if (procurementDay(deadline) === null) return false;
  // Date-only evidence is inclusive in Bangkok; never infer a submission time.
  const at = /^\d{4}-\d{2}-\d{2}$/.test(deadline)
    ? Date.parse(`${deadline}T23:59:59.999+07:00`)
    : Date.parse(deadline);
  return !Number.isNaN(at) && at > now.getTime();
}
