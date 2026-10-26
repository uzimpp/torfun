import { describe, expect, test } from 'bun:test';
import type { Experience } from '@torfun/types';
import { computeMatch, openForMatch, visibleForNotification } from './matching';
import { notificationTor } from '../../testing/notification-fixtures';
const experience: Experience = {
  id: 'one',
  companyId: 'company-a',
  clientId: 'client',
  projectName: 'Web application',
  description: null,
  techStack: [' typescript ', 'REACT'],
  targetPlatforms: ['web_app'],
  durationMonths: 12,
  durationUnit: 'months',
  createdAt: new Date(),
  updatedAt: new Date(),
};
describe('notification matching policy', () => {
  test('compares recorded evidence with reasons and stable input versions', () => {
    const tor = notificationTor();
    const first = computeMatch('company-a', tor, [experience]);
    expect(first.overallScore).toBe(1);
    expect(first.companyId).toBe('company-a');
    expect(first.reasons).toHaveLength(2);
    expect(first.unmatched.join(' ')).toContain('กฎหมาย');
    expect(first.inputVersion).toBe(
      computeMatch('company-a', tor, [experience], new Date('2030-01-01')).inputVersion,
    );
  });
  test('does not borrow another company evidence or infer missing criteria', () => {
    expect(computeMatch('company-b', notificationTor(), [experience]).overallScore).toBe(0);
    const tor = notificationTor();
    tor.analysis!.targetPlatforms = [];
    expect(computeMatch('company-a', tor, [experience]).overallScore).toBe(0.6);
    tor.analysis!.techStack = [];
    expect(computeMatch('company-a', tor, [experience]).overallScore).toBe(0);
  });
  test('one of two technologies plus platform overlap is exactly 70%', () => {
    expect(
      computeMatch('company-a', notificationTor(), [{ ...experience, techStack: ['React'] }])
        .overallScore,
    ).toBe(0.7);
  });
  test('open matches exclude hidden, ambiguous, failed and closed evidence', () => {
    const now = new Date('2026-10-26T12:00:00Z');
    for (const patch of [
      { status: 'contracted' as const },
      { publicationRemovedAt: now.toISOString() },
      { eBidding: false },
      { torAmbiguous: true },
      { outcome: 'analysis_failed' as const },
    ])
      expect(openForMatch(notificationTor(patch), now)).toBe(false);
    const tor = notificationTor();
    tor.analysis!.isSoftwareProject = false;
    expect(visibleForNotification(tor)).toBe(false);
  });
  test('date-only deadlines are inclusive in Bangkok, and invalid dates are not guessed', () => {
    const tor = notificationTor();
    tor.analysis!.deadlineAt = '2026-10-26';
    expect(openForMatch(tor, new Date('2026-10-26T16:59:59Z'))).toBe(true);
    expect(openForMatch(tor, new Date('2026-10-26T17:00:00Z'))).toBe(false);
    tor.analysis!.deadlineAt = 'not a date';
    expect(openForMatch(tor, new Date())).toBe(false);
  });
});
