import { createHash } from 'node:crypto';
import type {
  MatchResult,
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
  match: MatchResult;
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
  const initial = !previous?.matchedAt && input.qualifies;
  const changed = Boolean(previous?.matchedAt && previous.status !== input.status);
  const revision = (previous?.revision ?? 0) + (changed ? 1 : 0);
  const id = observationId(input);
  const observation: NotificationObservation = {
    id,
    matchedAt: previous?.matchedAt ?? (initial ? input.now.toISOString() : null),
    status: input.status,
    revision,
    sourceUpdatedAt: input.sourceUpdatedAt,
  };
  if (!initial && !changed) return { observation, notification: null, deliveries: [] };
  const event = initial ? 'match_found' : 'status_changed';
  const preferences = initial
    ? input.contact.preferences.matchFound
    : input.contact.preferences.statusChanged;
  const notification: Notification = {
    id: key(id, event, initial ? 'initial' : String(revision)),
    userId: input.userId,
    companyId: input.companyId,
    projectId: input.projectId,
    projectName: input.projectName,
    event,
    score: input.match.overallScore,
    reasons: input.match.reasons,
    previousStatus: initial ? null : previous!.status,
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
