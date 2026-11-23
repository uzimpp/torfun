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
  test('an enabled new-open alert survives an overlapping disabled status alert', () => {
    const first = input({ followed: true, status: 'drafting', open: false });
    first.contact.preferences.statusChanged = { inApp: false, email: false, line: false };
    first.contact.preferences.newOpen.inApp = true;
    const baseline = planNotification(first, null)!;
    const opened = { ...first, status: 'open' as const, open: true };
    const plan = planNotification(opened, baseline.observation)!;
    expect(plan.notification).toMatchObject({ event: 'new_open', inApp: true });
    expect(planNotification(opened, plan.observation)?.notification).toBeNull();
  });
  test('one new-open alert covers the first opening even when status alerts are enabled', () => {
    const first = input({ followed: true, status: 'drafting', open: false });
    first.contact.preferences.newOpen.inApp = true;
    const baseline = planNotification(first, null)!;
    const opened = { ...first, status: 'open' as const, open: true };
    const plan = planNotification(opened, baseline.observation)!;
    expect(plan.notification?.event).toBe('new_open');
    expect(planNotification(opened, plan.observation)?.notification).toBeNull();
    expect(
      planNotification({ ...opened, status: 'cancelled', open: false }, plan.observation)
        ?.notification?.event,
    ).toBe('status_changed');
  });
  test('enabling match alerts catches a still-eligible match without losing status tracking', () => {
    const first = input({ qualifies: true, open: true });
    first.contact.preferences.matchFound = { inApp: false, email: false, line: false };
    const baseline = planNotification(first, null)!;
    expect(baseline.notification).toBeNull();
    expect(baseline.observation.matchedAt).toBe(now.toISOString());
    expect(baseline.observation.matchNotifiedAt).toBeNull();
    expect(baseline.observation.openedAt).toBeNull();
    expect(
      planNotification(
        { ...first, qualifies: false, open: false, status: 'cancelled' },
        baseline.observation,
      )?.notification?.event,
    ).toBe('status_changed');
    first.contact.preferences.matchFound.inApp = true;
    const enabled = planNotification(first, baseline.observation)!;
    expect(enabled.notification?.event).toBe('match_found');
    expect(enabled.observation.matchNotifiedAt).toBe(now.toISOString());
    expect(planNotification(first, enabled.observation)?.notification).toBeNull();
  });
  test('unverified email and unfollowed LINE do not consume a first alert', () => {
    for (const channel of ['email', 'line'] as const) {
      const first = input({ qualifies: true, open: true });
      first.contact.preferences.matchFound = { inApp: false, email: false, line: false };
      first.contact.preferences.matchFound[channel] = true;
      const baseline = planNotification(first, null)!;
      expect(baseline.notification).toBeNull();
      expect(baseline.observation.matchNotifiedAt).toBeNull();
      const configured = {
        ...first,
        contact: {
          ...first.contact,
          email: 'officer@example.test',
          emailVerifiedAt: now.toISOString(),
          lineUserId: `U${'1'.repeat(32)}`,
          lineFollowing: true,
        },
      };
      const plan = planNotification(configured, baseline.observation)!;
      expect(plan.notification?.event).toBe('match_found');
      expect(plan.deliveries).toEqual([
        {
          channel,
          recipient: channel === 'email' ? configured.contact.email : configured.contact.lineUserId,
        },
      ]);
    }
  });
  test('first matches take precedence over new-open alerts without a later duplicate', () => {
    const first = input({ qualifies: true, open: true });
    first.contact.preferences.newOpen.inApp = true;
    const plan = planNotification(first, null)!;
    expect(plan.notification?.event).toBe('match_found');
    expect(planNotification(first, plan.observation)?.notification).toBeNull();
  });
  test('disabled status alerts update the baseline without creating hidden notifications', () => {
    const first = input({ followed: true });
    first.contact.preferences.statusChanged = { inApp: false, email: false, line: false };
    const baseline = planNotification(first, null)!;
    const changed = { ...first, status: 'cancelled' as const };
    const disabled = planNotification(changed, baseline.observation)!;
    expect(disabled.notification).toBeNull();
    expect(disabled.observation.status).toBe('cancelled');
    first.contact.preferences.statusChanged.inApp = true;
    expect(planNotification(changed, disabled.observation)?.notification).toBeNull();
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
