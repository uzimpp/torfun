import { z } from 'zod';
import { ProcurementStatus, TargetPlatform } from './egp';

export const MATCH_NOTIFICATION_THRESHOLD = 0.7;
export const NotificationEvent = z.enum(['match_found', 'status_changed', 'new_open']);
export type NotificationEvent = z.infer<typeof NotificationEvent>;
export const NotificationChannel = z.enum(['email', 'line']);
export type NotificationChannel = z.infer<typeof NotificationChannel>;

const ChannelsSchema = z
  .object({ in_app: z.boolean(), email: z.boolean(), line: z.boolean() })
  .strict();
export const NotificationFiltersSchema = z
  .object({
    agencies: z.array(z.string().trim().min(1).max(300)).max(20).default([]),
    min_budget: z.number().finite().nonnegative().nullable().default(null),
    max_budget: z.number().finite().nonnegative().nullable().default(null),
    work_types: z.array(TargetPlatform).max(5).default([]),
    min_qualification_score: z.number().min(0).max(1).nullable().default(null),
  })
  .strict()
  .refine((v) => v.min_budget === null || v.max_budget === null || v.min_budget <= v.max_budget, {
    message: 'Budget maximum must be at least the minimum',
    path: ['max_budget'],
  });

export const NotificationPreferencesSchema = z
  .object({
    match_found: ChannelsSchema,
    status_changed: ChannelsSchema,
    new_open: ChannelsSchema.default({ in_app: false, email: false, line: false }),
    filters: NotificationFiltersSchema.default({}),
  })
  .strict();
export type NotificationPreferences = z.infer<typeof NotificationPreferencesSchema>;
/** Wire value; services use the camelCase domain shape below. */
export interface NotificationSettings {
  matchFound: { inApp: boolean; email: boolean; line: boolean };
  statusChanged: { inApp: boolean; email: boolean; line: boolean };
  newOpen: { inApp: boolean; email: boolean; line: boolean };
  filters: {
    agencies: string[];
    minBudget: number | null;
    maxBudget: number | null;
    workTypes: z.infer<typeof TargetPlatform>[];
    minQualificationScore: number | null;
  };
}
export function preferencesToDomain(value: NotificationPreferences): NotificationSettings {
  const channel = (v: NotificationPreferences['match_found']) => ({
    inApp: v.in_app,
    email: v.email,
    line: v.line,
  });
  const parsed = NotificationPreferencesSchema.parse(value);
  return {
    matchFound: channel(parsed.match_found),
    statusChanged: channel(parsed.status_changed),
    newOpen: channel(parsed.new_open),
    filters: {
      agencies: parsed.filters.agencies,
      minBudget: parsed.filters.min_budget,
      maxBudget: parsed.filters.max_budget,
      workTypes: parsed.filters.work_types,
      minQualificationScore: parsed.filters.min_qualification_score,
    },
  };
}
export function preferencesToResponse(value: NotificationSettings): NotificationPreferences {
  const channel = (v: NotificationSettings['matchFound']) => ({
    in_app: v.inApp,
    email: v.email,
    line: v.line,
  });
  return {
    match_found: channel(value.matchFound),
    status_changed: channel(value.statusChanged),
    new_open: channel(value.newOpen),
    filters: {
      agencies: value.filters.agencies,
      min_budget: value.filters.minBudget,
      max_budget: value.filters.maxBudget,
      work_types: value.filters.workTypes,
      min_qualification_score: value.filters.minQualificationScore,
    },
  };
}
export function defaultNotificationPreferences(): NotificationPreferences {
  return {
    match_found: { in_app: true, email: false, line: false },
    status_changed: { in_app: true, email: false, line: false },
    new_open: { in_app: false, email: false, line: false },
    filters: NotificationFiltersSchema.parse({}),
  };
}

export interface Notification {
  id: string;
  userId: string;
  companyId: string;
  projectId: string;
  projectName: string;
  event: NotificationEvent;
  score: number | null;
  scoringVersion?: string;
  reasons: string[];
  previousStatus: z.infer<typeof ProcurementStatus> | null;
  status: z.infer<typeof ProcurementStatus>;
  deadlineAt: string | null;
  inApp: boolean;
  readAt: string | null;
  dismissedAt: string | null;
  createdAt: string;
}

export const NotificationResponseSchema = z.object({
  id: z.string(),
  project_id: z.string(),
  project_name: z.string(),
  event: NotificationEvent,
  score: z.number().min(0).max(1).nullable(),
  scoring_version: z.string().optional(),
  reasons: z.array(z.string()),
  previous_status: ProcurementStatus.nullable(),
  status: ProcurementStatus,
  deadline_at: z.string().nullable(),
  read_at: z.string().nullable(),
  created_at: z.string(),
});
export type NotificationResponse = z.infer<typeof NotificationResponseSchema>;
export const NotificationListQuerySchema = z.object({
  filter: z.enum(['all', 'unread']).default('all'),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  offset: z.coerce.number().int().min(0).max(10000).default(0),
});
export const NotificationListResponseSchema = z.object({
  items: z.array(NotificationResponseSchema),
  total: z.number(),
  unread_count: z.number(),
});
export type NotificationListResponse = z.infer<typeof NotificationListResponseSchema>;
export const NotificationSettingsResponseSchema = z.object({
  preferences: NotificationPreferencesSchema,
  match_threshold: z.number(),
  email: z.string().email().nullable(),
  email_verified: z.boolean(),
  email_available: z.boolean(),
  line_available: z.boolean(),
  line_linked: z.boolean(),
  line_connected: z.boolean(),
  line_add_friend_url: z.string().nullable(),
});
export type NotificationSettingsResponse = z.infer<typeof NotificationSettingsResponseSchema>;

export interface NotificationSettingsView {
  preferences: NotificationSettings;
  matchThreshold: number;
  email: string | null;
  emailVerified: boolean;
  emailAvailable: boolean;
  lineAvailable: boolean;
  lineLinked: boolean;
  lineConnected: boolean;
  lineAddFriendUrl: string | null;
}

export interface NotificationDeliveryFailure {
  id: string;
  channel: NotificationChannel;
  attempts: number;
  error: string | null;
  createdAt: string;
  state: 'failed' | 'retry';
}
export const NotificationDeliveryFailureResponseSchema = z.object({
  id: z.string(),
  channel: NotificationChannel,
  attempts: z.number().int(),
  error: z.string().nullable(),
  created_at: z.string(),
  state: z.enum(['failed', 'retry']),
});
export type NotificationDeliveryFailureResponse = z.infer<
  typeof NotificationDeliveryFailureResponseSchema
>;

export const NotificationMatchResponseSchema = z.object({
  match: z
    .object({
      company_id: z.string(),
      project_id: z.string(),
      overall_score: z.number().nullable(),
      reasons: z.array(z.string()),
      unmatched: z.array(z.string()),
      scoring_version: z.string(),
      input_version: z.string(),
      computed_at: z.string(),
    })
    .nullable(),
});
export type NotificationMatchResponse = z.infer<typeof NotificationMatchResponseSchema>;

export interface NotificationContact {
  userId: string;
  preferences: NotificationSettings;
  email: string | null;
  emailVerifiedAt: string | null;
  lineUserId: string | null;
  lineFollowing: boolean;
}
export interface NotificationDelivery {
  id: string;
  notification: Notification;
  channel: NotificationChannel;
  recipient: string;
  attempts: number;
  retryKey: string;
  leaseToken: string;
  createdAt: string;
}

export interface NotificationObservation {
  id: string;
  /** Eligibility history, including matches observed while match alerts were disabled. */
  matchedAt: string | null;
  /** First persisted match alert; legacy observations are reconciled from stored alerts. */
  matchNotifiedAt?: string | null;
  openedAt?: string | null;
  deadlineAt?: string | null;
  status: z.infer<typeof ProcurementStatus>;
  revision: number;
  sourceUpdatedAt: string;
}
export interface NotificationObservationPlan {
  observation: NotificationObservation;
  notification: Notification | null;
  deliveries: { channel: NotificationChannel; recipient: string }[];
}
