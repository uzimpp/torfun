import { describe, expect, test } from 'bun:test';
import { EMPTY_MILESTONES, type Procurement } from '@torfun/types';
import { reviewTimeline } from './timeline';

const NOW = '2026-10-04T03:00:00.000Z';
const row = (announceType: string, announceDate: string | null = null) => ({
  announceType,
  announceDate,
});

const stored = (overrides: Partial<Procurement> = {}) => ({
  milestones: EMPTY_MILESTONES,
  deadlineAt: null,
  deadlineSource: null,
  analysis: null,
  timelineCheckedAt: null,
  ...overrides,
});

describe('reviewTimeline', () => {
  test('derives status, milestones and the check time', () => {
    const { patch } = reviewTimeline(stored(), [row('D0', '2026-09-20T02:00:00.000Z')], NOW);

    expect(patch).toMatchObject({
      status: 'open',
      milestones: { invited: { at: '2026-09-20T00:00:00.000Z' } },
      timelineCheckedAt: NOW,
    });
  });

  test('the bidding date becomes the deadline, ahead of what was stored', () => {
    const { patch } = reviewTimeline(
      stored({ deadlineAt: '2026-10-01T00:00:00.000Z', deadlineSource: 'invitation' }),
      [row('D0', '2026-09-20T02:00:00.000Z'), row('price', '2026-10-02T02:00:00.000Z')],
      NOW,
    );

    expect(patch).toMatchObject({
      status: 'evaluating',
      deadlineAt: '2026-10-02T00:00:00.000Z',
      deadlineSource: 'timeline',
    });
  });

  test('keeps the deadline it has when the timeline offers none, and falls back on the stored TOR reading', () => {
    const kept = { deadlineAt: '2026-10-01T00:00:00.000Z', deadlineSource: 'invitation' as const };
    expect(reviewTimeline(stored(kept), [row('BOQ')], NOW).patch).toMatchObject(kept);

    const analysis = { deadlineAt: '2026-10-09T00:00:00.000Z' } as Procurement['analysis'];
    expect(reviewTimeline(stored({ analysis }), [row('BOQ')], NOW).patch).toMatchObject({
      deadlineAt: '2026-10-09T00:00:00.000Z',
      deadlineSource: 'tor',
    });
  });

  test('the same milestones are not a change', () => {
    const rows = [row('D0', '2026-09-20T02:00:00.000Z')];
    const first = reviewTimeline(stored(), rows, NOW);

    const again = reviewTimeline(stored({ milestones: first.patch.milestones }), rows, NOW);

    expect(again.changed).toBe(false);
    expect(again.invitationMoved).toBe(false);
  });

  test('a new stage is a change but does not move the invitation', () => {
    const invited = { ...EMPTY_MILESTONES, invited: { at: '2026-09-20T00:00:00.000Z' } };

    const review = reviewTimeline(
      stored({ milestones: invited }),
      [row('D0', '2026-09-20T02:00:00.000Z'), row('W0', '2026-10-01T02:00:00.000Z')],
      NOW,
    );

    expect(review.changed).toBe(true);
    expect(review.invitationMoved).toBe(false);
  });

  test('a re-dated or newly published invitation moves it', () => {
    const invited = { ...EMPTY_MILESTONES, invited: { at: '2026-09-20T00:00:00.000Z' } };

    expect(
      reviewTimeline(stored({ milestones: invited }), [row('D0', '2026-09-27T02:00:00.000Z')], NOW)
        .invitationMoved,
    ).toBe(true);
    expect(
      reviewTimeline(stored(), [row('D0', '2026-09-27T02:00:00.000Z')], NOW).invitationMoved,
    ).toBe(true);
  });

  test('an invitation with no date cannot be re-read for a date it does not have', () => {
    expect(reviewTimeline(stored(), [row('D0')], NOW).invitationMoved).toBe(false);
  });

  test('hands back the codes it does not know', () => {
    expect(reviewTimeline(stored(), [row('explain')], NOW).unrecognised).toEqual([row('explain')]);
  });

  describe('of the codes it does not know, hands back only those not seen at the last check', () => {
    const checked = stored({ timelineCheckedAt: '2026-10-01T03:00:00.000Z' });

    test('one dated before the last check was handed back then', () => {
      expect(
        reviewTimeline(checked, [row('explain', '2026-09-29T02:00:00.000Z')], NOW).unrecognised,
      ).toEqual([]);
    });

    test('one dated since is new, even when no milestone moved', () => {
      const later = row('X9', '2026-10-02T02:00:00.000Z');
      expect(reviewTimeline(checked, [later], NOW).unrecognised).toEqual([later]);
    });

    test('one dated the same Bangkok day as the last check may have come after it', () => {
      const sameDay = row('explain', '2026-09-30T17:00:00.000Z');
      expect(reviewTimeline(checked, [sameDay], NOW).unrecognised).toEqual([sameDay]);
    });

    test('an undated one is handed back only on the first read', () => {
      expect(reviewTimeline(checked, [row('X9')], NOW).unrecognised).toEqual([]);
    });
  });
});
