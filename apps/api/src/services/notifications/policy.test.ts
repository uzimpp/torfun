import { describe, expect, test } from 'bun:test';
import {
  defaultNotificationPreferences,
  preferencesToDomain,
  NotificationPreferencesSchema,
  type CompanyQualificationsRecord,
} from '@torfun/types';
import { notificationTor } from '../../testing/notification-fixtures';
import { computeNotificationMatch, passesNotificationFilters } from './matching';
import { observationId, planNotification, type NotificationEventInput } from './events';
import { computeQualificationMatch } from '../qualification-match';
import { notificationMessage } from './message';
import { renderNotificationEmail } from './email-template';
import { renderNotificationLine } from './line-template';
const now = new Date('2026-11-16T00:00:00Z');
const profile: CompanyQualificationsRecord = {
  companyId: 'company',
  revision: null,
  registeredCapitalThb: 100,
  bidBudgetMinThb: null,
  bidBudgetMaxThb: null,
  certificates: [],
  personnel: [],
};
const contact = () => ({
  userId: 'officer',
  preferences: preferencesToDomain(defaultNotificationPreferences()),
  email: null,
  emailVerifiedAt: null,
  lineUserId: null,
  lineFollowing: false,
});
const input = (patch: Partial<NotificationEventInput> = {}): NotificationEventInput => ({
  userId: 'officer',
  companyId: 'company',
  projectId: 'project',
  projectName: 'project',
  status: 'open',
  deadlineAt: '2030-12-31',
  sourceUpdatedAt: now.toISOString(),
  now,
  match: { overallScore: null, reasons: [] },
  qualifies: false,
  contact: contact(),
  ...patch,
});
describe('notification qualification and event policy', () => {
  test('shares the TOR detail score and includes unmet and unknown clauses', () => {
    const tor = notificationTor();
    tor.analysis!.qualifications = [
      {
        kind: 'registered_capital',
        minValueThb: 50,
        text: 'ทุน 50',
        source: '4.1',
        manualReviewReason: null,
      },
      {
        kind: 'registered_capital',
        minValueThb: 150,
        text: 'ทุน 150',
        source: '4.2',
        manualReviewReason: null,
      },
      { kind: 'manual', text: 'ตรวจต้นฉบับ', source: '4.3' },
    ];
    const match = computeNotificationMatch('company', tor, profile, [], now);
    expect(match.overallScore).toBe(
      computeQualificationMatch(
        tor.projectId,
        tor.analysis!.qualifications,
        profile,
        [],
        '2026-11-16',
        now,
      ).overallScore,
    );
    expect(match.disqualified).toBe(true);
    expect(match.reasons).toContain('ไม่ตรงเงื่อนไข: ทุน 150');
    expect(match.reasons).toContain('ต้องตรวจเพิ่ม: ตรวจต้นฉบับ');
    expect(computeNotificationMatch('company', tor, null, [], now).overallScore).toBeNull();
    tor.analysis!.qualifications = undefined;
    expect(computeNotificationMatch('company', tor, profile, [], now).overallScore).toBeNull();
  });
  test('followed unmatched TORs report deadline and status changes once', () => {
    const first = input({ followed: true });
    const baseline = planNotification(first, null)!;
    expect(baseline.notification).toBeNull();
    const changed = input({
      followed: true,
      deadlineAt: '2031-01-01',
      sourceUpdatedAt: '2026-11-17T00:00:00Z',
    });
    const deadline = planNotification(changed, baseline.observation)!;
    expect(deadline.notification).toMatchObject({ event: 'status_changed', score: null });
    expect(planNotification(changed, deadline.observation)?.notification).toBeNull();
    expect(
      planNotification({ ...changed, status: 'cancelled' }, deadline.observation)?.notification
        ?.event,
    ).toBe('status_changed');
    expect(
      planNotification({ ...changed, followed: false }, baseline.observation)?.notification,
    ).toBeNull();
    expect(
      planNotification(changed, { ...baseline.observation, deadlineAt: undefined })?.notification,
    ).toBeNull();
    expect(planNotification(first, deadline.observation)).toBeNull();
  });
  test('new-open opt-in works without a company or score', () => {
    const first = input({ companyId: '', open: true });
    first.contact.preferences.newOpen.inApp = true;
    const plan = planNotification(first, null)!;
    expect(plan.notification).toMatchObject({ event: 'new_open', score: null, companyId: '' });
    expect(planNotification(first, plan.observation)?.notification).toBeNull();
    expect(observationId(first)).not.toBe(observationId({ ...first, companyId: 'other' }));
    expect(planNotification(input({ open: true }), null)?.notification).toBeNull();
    expect(planNotification({ ...first, acceptsFilters: false }, null)?.notification).toBeNull();
    const message = notificationMessage(plan.notification!, 'https://torfun.example');
    expect(message.text).toContain('ยังไม่มีคะแนนคุณสมบัติ');
    expect(renderNotificationEmail(message)).not.toContain('null%');
    expect(JSON.stringify(renderNotificationLine(message))).not.toContain('null%');
  });
  test('filters use evidence, include bounds, and reject unknown values', () => {
    const tor = notificationTor();
    const filters = contact().preferences.filters;
    Object.assign(filters, {
      agencies: [tor.deptName],
      minBudget: 1000000,
      maxBudget: 1000000,
      workTypes: ['web_app'],
      minQualificationScore: 0.7,
    });
    expect(passesNotificationFilters(tor, 0.7, filters)).toBe(true);
    expect(passesNotificationFilters(tor, null, filters)).toBe(false);
    expect(passesNotificationFilters({ ...tor, projectMoney: null }, 1, filters)).toBe(false);
    expect(passesNotificationFilters({ ...tor, deptName: 'another' }, 1, filters)).toBe(false);
    expect(passesNotificationFilters({ ...tor, analysis: null }, 1, filters)).toBe(false);
  });
  test('old preferences default safely and forged filters fail', () => {
    const { new_open: _newOpen, filters: _filters, ...old } = defaultNotificationPreferences();
    expect(preferencesToDomain(NotificationPreferencesSchema.parse(old)).newOpen.inApp).toBe(false);
    expect(
      NotificationPreferencesSchema.safeParse({ ...old, filters: { min_budget: 2, max_budget: 1 } })
        .success,
    ).toBe(false);
    expect(
      NotificationPreferencesSchema.safeParse({ ...old, filters: { min_qualification_score: 1.1 } })
        .success,
    ).toBe(false);
    expect(
      NotificationPreferencesSchema.safeParse({ ...old, filters: { user_id: 'other' } }).success,
    ).toBe(false);
  });
});
