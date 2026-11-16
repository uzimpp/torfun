import { createHash } from 'node:crypto';
import type {
  Notification,
  NotificationContact,
  NotificationObservation,
  NotificationObservationPlan,
  ProcurementStatus,
} from '@torfun/types';

export interface NotificationEventInput {
  userId: string;
  companyId: string;
  projectId: string;
  projectName: string;
  status: ProcurementStatus;
  deadlineAt: string | null;
  match: { overallScore: number | null; reasons: string[]; scoringVersion?: string };
  followed?: boolean;
  open?: boolean;
  acceptsFilters?: boolean;
  qualifies: boolean;
  contact: NotificationContact;
  now: Date;
  sourceUpdatedAt: string;
}
const key = (...parts: string[]) =>
  createHash('sha256').update(JSON.stringify(parts)).digest('hex');
export const observationId = (
  input: Pick<NotificationEventInput, 'userId' | 'companyId' | 'projectId'>,
) => key(input.userId, input.companyId, input.projectId);

/** Pure business policy. Mongo may replay this decision after a write conflict. */
export function planNotification(
  input: NotificationEventInput,
  previous: NotificationObservation | null,
): NotificationObservationPlan | null {
  if (previous && Date.parse(previous.sourceUpdatedAt) > Date.parse(input.sourceUpdatedAt))
    return null;
  const accepted = input.acceptsFilters !== false;
  const initial = !previous?.matchedAt && input.qualifies && accepted;
  const newOpenPreferences = input.contact.preferences.newOpen;
  const opened =
    !previous?.openedAt &&
    input.open &&
    accepted &&
    (newOpenPreferences.inApp || newOpenPreferences.email || newOpenPreferences.line);
  const changed = Boolean(
    previous &&
    (previous.matchedAt || input.followed) &&
    accepted &&
    (previous.status !== input.status ||
      (previous.deadlineAt !== undefined && previous.deadlineAt !== input.deadlineAt)),
  );
  const revision = (previous?.revision ?? 0) + (changed ? 1 : 0);
  const id = observationId(input);
  const observation: NotificationObservation = {
    id,
    matchedAt: previous?.matchedAt ?? (initial ? input.now.toISOString() : null),
    openedAt: previous?.openedAt ?? (opened || initial ? input.now.toISOString() : null),
    deadlineAt: input.deadlineAt,
    status: input.status,
    revision,
    sourceUpdatedAt: input.sourceUpdatedAt,
  };
  if (!initial && !changed && !opened) return { observation, notification: null, deliveries: [] };
  const matchPreferences = input.contact.preferences.matchFound;
  const event =
    initial && (matchPreferences.inApp || matchPreferences.email || matchPreferences.line)
      ? 'match_found'
      : changed
        ? 'status_changed'
        : opened
          ? 'new_open'
          : null;
  if (!event) return { observation, notification: null, deliveries: [] };
  const preferences =
    input.contact.preferences[
      event === 'match_found' ? 'matchFound' : event === 'new_open' ? 'newOpen' : 'statusChanged'
    ];
  if (event === 'new_open' && !preferences.inApp && !preferences.email && !preferences.line)
    return { observation, notification: null, deliveries: [] };
  const notification: Notification = {
    id: key(id, event, event === 'status_changed' ? String(revision) : 'initial'),
    userId: input.userId,
    companyId: input.companyId,
    projectId: input.projectId,
    projectName: input.projectName,
    event,
    score: input.match.overallScore,
    scoringVersion: input.match.scoringVersion ?? 'technology-platform-v1',
    reasons: input.match.reasons,
    previousStatus: event === 'status_changed' ? previous!.status : null,
    status: input.status,
    deadlineAt: input.deadlineAt,
    inApp: preferences.inApp,
    readAt: null,
    dismissedAt: null,
    createdAt: input.now.toISOString(),
  };
  const deliveries: NotificationObservationPlan['deliveries'] = [];
  if (preferences.email && input.contact.email && input.contact.emailVerifiedAt)
    deliveries.push({ channel: 'email', recipient: input.contact.email });
  if (preferences.line && input.contact.lineUserId && input.contact.lineFollowing)
    deliveries.push({ channel: 'line', recipient: input.contact.lineUserId });
  return { observation, notification, deliveries };
}
