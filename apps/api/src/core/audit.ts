import type { FastifyBaseLogger } from 'fastify';

/**
 * Security audit trail (ASVS V16.3.1, V16.3.2, V16.4.1; threat T-16).
 *
 * One structured record per security-relevant event, always at `info` and
 * always carrying `audit: true`, so a log pipeline can route them apart from
 * request noise. Records name *who* (user id or the username that was tried),
 * *what* and *from where* (the request logger adds `reqId`; callers add `ip`).
 *
 * Never pass a password, token or cookie here — `LOG_REDACTION` is a backstop,
 * not permission.
 */
export type AuditEvent =
  | 'auth.register'
  | 'auth.login.success'
  | 'auth.login.failure'
  | 'auth.throttled'
  | 'auth.password.changed'
  | 'auth.logout'
  | 'auth.refresh.failure'
  | 'auth.google.success'
  | 'auth.google.failure'
  | 'admin.user.updated'
  | 'admin.company.manager.assigned'
  | 'company.created'
  | 'company.join.requested'
  | 'company.join.auto_approved'
  | 'company.join.approved'
  | 'company.join.rejected'
  | 'company.join.withdrawn'
  | 'company.manager.changed'
  | 'company.member.removed'
  | 'company.settings.changed';

export interface AuditFields {
  ip?: string;
  userId?: string;
  username?: string;
  reason?: string;
  [extra: string]: unknown;
}

/** Usernames come from the client: bound the length so a log line cannot be flooded. */
const clip = (value: string) => value.slice(0, 100).replace(/[\r\n]/g, ' ');

export function audit(log: FastifyBaseLogger, event: AuditEvent, fields: AuditFields = {}) {
  const safe: AuditFields = { ...fields };
  if (typeof safe.username === 'string') safe.username = clip(safe.username);
  log.info({ audit: true, event, ...safe }, `audit: ${event}`);
}
