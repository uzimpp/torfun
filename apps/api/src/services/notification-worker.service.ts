import {
  MATCH_NOTIFICATION_THRESHOLD,
  type NotificationDelivery,
  type Procurement,
  type User,
} from '@torfun/types';
import type { UserStore } from '../repositories/user.repository';
import type { ExperienceStore } from '../repositories/experience.repository';
import type { NotificationStore } from '../repositories/notification.repository';
import type { NotificationContactStore } from '../repositories/notification-contact.repository';
import type { NotificationSource } from './notification.service';
import type { EmailSender } from './notifications/email';
import { DeliveryError } from './notifications/email';
import type { LineSender } from './notifications/line';
import { computeMatch, openForMatch, visibleForNotification } from './notifications/matching';
import { observationId, planNotification } from './notifications/events';
import { renderNotificationEmail } from './notifications/email-template';
import { renderNotificationLine } from './notifications/line-template';
import { notificationMessage } from './notifications/message';

export class NotificationWorkerService {
  private running = false;
  private timer: ReturnType<typeof setInterval> | null = null;
  constructor(
    private readonly store: NotificationStore,
    private readonly contacts: NotificationContactStore,
    private readonly users: UserStore,
    private readonly experiences: ExperienceStore,
    private readonly source: NotificationSource,
    private readonly email: EmailSender | null,
    private readonly line: LineSender | null,
    private readonly webUrl: string,
    private readonly logger: { error(message: string): void },
    private readonly now: () => Date = () => new Date(),
    private readonly ensure: () => Promise<void> = async () => {},
  ) {}

  async run() {
    if (this.running) return { busy: true, changes: 0, deliveries: 0 };
    this.running = true;
    let changes = 0;
    let deliveries = 0;
    try {
      await this.ensure();
      const officers = (await this.users.list()).filter(
        (u) => u.isActive && u.role === 'business_development_officer' && u.companyId,
      );
      // The journal closes the crash gap. Stale snapshots are skipped: the
      // reconciliation pass reads the latest evidence rather than announcing obsolete states.
      for (; changes < 20; changes++) {
        const change = await this.source.claimNotificationChange(this.now());
        if (!change) break;
        const current = await this.source.get(change.record.projectId);
        if (current && current.updatedAt === change.record.updatedAt)
          await this.evaluate(current, officers);
        await this.source.finishNotificationChange(change);
      }
      // One company and 20 real records per pass, with a persisted round-robin
      // cursor. Profile edits and newly joined users are eventually re-evaluated.
      const companies = [...new Set(officers.map((u) => u.companyId!))].sort();
      const afterCompany = await this.store.cursor('_company');
      const companyId = companies.find((id) => id > afterCompany) ?? companies[0];
      if (companyId) {
        const after = await this.store.cursor(companyId);
        const records = await this.source.notificationPage(after, 20);
        for (const record of records)
          await this.evaluate(
            record,
            officers.filter((u) => u.companyId === companyId),
          );
        await this.store.saveCursor(
          companyId,
          records.length === 20 ? records.at(-1)!.projectId : '',
        );
        await this.store.saveCursor('_company', companyId);
      }
      for (; deliveries < 10; deliveries++) {
        const job = await this.store.claimDelivery(this.now(), 5);
        if (!job) break;
        await this.deliver(job);
      }
      return { busy: false, changes, deliveries };
    } finally {
      this.running = false;
    }
  }

  private async evaluate(tor: Procurement, users: User[]) {
    if (!visibleForNotification(tor) || !(await this.source.isPublished(tor.projectId))) return;
    const companies = [...new Set(users.map((u) => u.companyId!))];
    for (const companyId of companies) {
      const match = computeMatch(
        companyId,
        tor,
        await this.experiences.listByCompany(companyId),
        this.now(),
      );
      for (const officer of users.filter((u) => u.companyId === companyId)) {
        const current = await this.users.findById(officer.id);
        if (
          !current?.isActive ||
          current.role !== 'business_development_officer' ||
          current.companyId !== companyId
        )
          continue;
        const input = {
          userId: current.id,
          companyId,
          projectId: tor.projectId,
          projectName: tor.projectName,
          status: tor.timeline.status,
          deadlineAt: tor.timeline.deadlineAt ?? tor.analysis?.deadlineAt ?? null,
          match,
          qualifies:
            match.overallScore >= MATCH_NOTIFICATION_THRESHOLD && openForMatch(tor, this.now()),
          contact: await this.contacts.get(current.id),
          now: this.now(),
          sourceUpdatedAt: tor.updatedAt,
        };
        await this.store.observe(observationId(input), (previous) =>
          planNotification(input, previous),
        );
      }
    }
  }

  private async deliver(job: NotificationDelivery) {
    const now = this.now();
    const finish = (
      state: 'accepted' | 'failed' | 'skipped' | 'retry',
      error: string | null = null,
      next = now,
    ) =>
      this.store.finishDelivery(
        job,
        state === 'retry' && job.attempts >= 5 ? 'failed' : state,
        error,
        next,
      );
    try {
      const user = await this.users.findById(job.notification.userId);
      const current = await this.source.get(job.notification.projectId);
      if (
        !user?.isActive ||
        user.role !== 'business_development_officer' ||
        user.companyId !== job.notification.companyId ||
        !current ||
        !visibleForNotification(current) ||
        !(await this.source.isPublished(current.projectId))
      )
        return finish('skipped', 'Recipient or procurement is no longer eligible');
      const contact = await this.contacts.get(user.id);
      const preferences =
        job.notification.event === 'match_found'
          ? contact.preferences.matchFound
          : contact.preferences.statusChanged;
      const destination =
        job.channel === 'email'
          ? contact.emailVerifiedAt
            ? contact.email
            : null
          : contact.lineFollowing
            ? contact.lineUserId
            : null;
      if (!preferences[job.channel] || destination !== job.recipient)
        return finish('skipped', 'Channel disabled or destination changed');
      if (job.notification.event === 'match_found' && !openForMatch(current, now))
        return finish('skipped', 'Opportunity is no longer open');
      if (job.notification.event === 'match_found') {
        const match = computeMatch(
          user.companyId!,
          current,
          await this.experiences.listByCompany(user.companyId!),
          now,
        );
        if (match.overallScore < MATCH_NOTIFICATION_THRESHOLD)
          return finish('skipped', 'Company profile no longer meets the matching threshold');
      }
      if (
        job.notification.event === 'status_changed' &&
        job.notification.status !== current.timeline.status
      )
        return finish('skipped', 'A newer procurement status superseded this message');
      if (now.getTime() - Date.parse(job.createdAt) >= 24 * 3600000)
        return finish('failed', 'Delivery expired after 24 hours; no automatic resend');
      const message = notificationMessage(job.notification, this.webUrl);
      if (job.channel === 'email') {
        if (!this.email)
          return finish('retry', 'SMTP is not configured', new Date(now.getTime() + 3600000));
        await this.email.send(
          job.recipient,
          message.subject,
          message.text,
          job.id,
          renderNotificationEmail(message),
        );
      } else {
        if (!this.line)
          return finish('retry', 'LINE is not configured', new Date(now.getTime() + 3600000));
        await this.line.push(
          job.recipient,
          `${message.text.slice(0, 3600)}\n${message.url}\nตั้งค่าการแจ้งเตือน: ${message.settingsUrl}`,
          job.retryKey,
          renderNotificationLine(message),
        );
      }
      await finish('accepted');
    } catch (error) {
      const known = error instanceof DeliveryError;
      const permanent = (known && error.permanent) || job.attempts >= 5;
      const delay =
        known && error.retryAfterMs
          ? error.retryAfterMs
          : Math.min(3600000, 30000 * 2 ** (job.attempts - 1));
      // Never persist SMTP credentials, provider response bodies or email addresses in errors.
      await finish(
        permanent ? 'failed' : 'retry',
        known ? error.message : 'Delivery attempt failed',
        new Date(now.getTime() + delay),
      );
    }
  }

  start(interval: number) {
    if (this.timer) return;
    this.timer = setInterval(() => {
      void this.run().catch(() =>
        this.logger.error('notifications: local worker failed; durable jobs remain queued'),
      );
    }, interval);
    this.timer.unref();
  }
  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}
