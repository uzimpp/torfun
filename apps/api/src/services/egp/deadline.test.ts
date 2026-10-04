import { describe, expect, test } from 'bun:test';
import { decideDeadline } from './deadline';

const INVITATION = '2026-10-20T09:30:00.000Z';
const TOR = '2026-10-15T00:00:00.000Z';
const PRICED = '2026-10-22T00:00:00.000Z';

describe('decideDeadline', () => {
  const none = { priced: null, invitationBidAt: null, torDeadline: null };
  const empty = { deadlineAt: null, deadlineSource: null };

  describe('among one pass’s readings', () => {
    test('the timeline outranks the invitation and the TOR', () => {
      expect(
        decideDeadline(empty, { priced: PRICED, invitationBidAt: INVITATION, torDeadline: TOR }),
      ).toEqual({ deadlineAt: PRICED, deadlineSource: 'timeline' });
    });

    test('the invitation outranks the TOR', () => {
      expect(
        decideDeadline(empty, { ...none, invitationBidAt: INVITATION, torDeadline: TOR }),
      ).toEqual({ deadlineAt: INVITATION, deadlineSource: 'invitation' });
    });

    test('the TOR is used when nothing better gave one', () => {
      expect(decideDeadline(empty, { ...none, torDeadline: TOR })).toEqual({
        deadlineAt: TOR,
        deadlineSource: 'tor',
      });
    });

    test('is empty when nothing states a deadline', () => {
      expect(decideDeadline(empty, none)).toEqual(empty);
    });
  });

  describe('against what is stored', () => {
    const stored = { deadlineAt: INVITATION, deadlineSource: 'invitation' as const };

    test('returns only the deadline fields, even when handed a whole record', () => {
      const record = { ...stored, projectId: '1', documents: [] };

      expect(Object.keys(decideDeadline(record, none)).sort()).toEqual([
        'deadlineAt',
        'deadlineSource',
      ]);
    });

    test('a lower source never overwrites a higher one', () => {
      expect(decideDeadline(stored, { ...none, torDeadline: TOR })).toEqual(stored);
    });

    test('an equal source replaces, so a re-dated invitation is followed', () => {
      const redated = '2026-10-27T09:30:00.000Z';
      expect(decideDeadline(stored, { ...none, invitationBidAt: redated })).toEqual({
        deadlineAt: redated,
        deadlineSource: 'invitation',
      });
    });

    test('a higher source replaces a lower one', () => {
      const fromTor = { deadlineAt: TOR, deadlineSource: 'tor' as const };
      expect(decideDeadline(fromTor, { ...none, invitationBidAt: INVITATION })).toEqual(stored);
    });

    test('is kept when the pass states none', () => {
      expect(decideDeadline(stored, none)).toEqual(stored);
    });

    test('a timeline deadline is not displaced by an invitation', () => {
      const fromTimeline = { deadlineAt: TOR, deadlineSource: 'timeline' as const };
      expect(decideDeadline(fromTimeline, { ...none, invitationBidAt: INVITATION })).toEqual(
        fromTimeline,
      );
    });
  });
});
