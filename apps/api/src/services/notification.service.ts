import { createHash, randomBytes, randomUUID } from 'node:crypto';
import {
  MATCH_NOTIFICATION_THRESHOLD,
  type NotificationSettings,
  type NotificationSettingsView,
} from '@torfun/types';
import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
} from '../core/errors';
import type { UserStore } from '../repositories/user.repository';
import type { ExperienceStore } from '../repositories/experience.repository';
import type { NotificationStore } from '../repositories/notification.repository';
import type { NotificationContactStore } from '../repositories/notification-contact.repository';
import type { ProcurementRepository } from '../repositories/procurement.repository';
import type { EmailSender } from './notifications/email';
import { renderAccountEmail } from './notifications/email-template';
import { computeMatch, visibleForNotification } from './notifications/matching';

export type NotificationSource = Pick<
  ProcurementRepository,
  | 'get'
  | 'notificationRecords'
  | 'notificationPage'
  | 'claimNotificationChange'
  | 'finishNotificationChange'
  | 'isPublished'
>;
const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex');

export class NotificationService {
  constructor(
    private readonly store: NotificationStore,
    private readonly contacts: NotificationContactStore,
    private readonly users: UserStore,
    private readonly experiences: ExperienceStore,
    private readonly source: NotificationSource,
    private readonly emailSender: EmailSender | null,
    private readonly config: { webUrl: string; lineAvailable: boolean; lineOaId: string },
    private readonly now: () => Date = () => new Date(),
  ) {}

  async officer(userId: string) {
    const user = await this.users.findById(userId);
    if (!user?.isActive) throw new UnauthorizedError();
    if (user.role !== 'business_development_officer')
      throw new ForbiddenError('การแจ้งเตือนโอกาสสำหรับเจ้าหน้าที่พัฒนาธุรกิจ');
    return user;
  }

  async administrator(userId: string) {
    const user = await this.users.findById(userId);
    if (!user?.isActive) throw new UnauthorizedError();
    if (user.role !== 'admin') throw new ForbiddenError('Admin access required');
  }

  private async visibleIds(userId: string, companyId: string) {
    const ids = await this.store.projectIds(userId, companyId);
    return (await this.source.notificationRecords(ids))
      .filter(visibleForNotification)
      .map((record) => record.projectId);
  }

  async list(userId: string, query: { filter: 'all' | 'unread'; limit: number; offset: number }) {
    const user = await this.officer(userId);
    if (!user.companyId) return { items: [], total: 0, unreadCount: 0 };
    return this.store.list(
      user.id,
      user.companyId,
      query.filter === 'unread',
      query.limit,
      query.offset,
      await this.visibleIds(user.id, user.companyId),
    );
  }

  async update(userId: string, id: string, action: 'read' | 'dismiss') {
    const user = await this.officer(userId);
    if (
      !user.companyId ||
      !(await this.store.update(user.id, user.companyId, id, action, this.now()))
    )
      throw new NotFoundError('ไม่พบการแจ้งเตือนนี้');
  }

  async readAll(userId: string) {
    const user = await this.officer(userId);
    if (user.companyId)
      await this.store.readAll(
        user.id,
        user.companyId,
        await this.visibleIds(user.id, user.companyId),
        this.now(),
      );
  }

  async settings(userId: string): Promise<NotificationSettingsView> {
    await this.officer(userId);
    const contact = await this.contacts.get(userId);
    return {
      preferences: contact.preferences,
      matchThreshold: MATCH_NOTIFICATION_THRESHOLD,
      email: contact.email,
      emailVerified: Boolean(contact.emailVerifiedAt),
      emailAvailable: this.emailSender !== null,
      lineAvailable: this.config.lineAvailable,
      lineLinked: Boolean(contact.lineUserId),
      lineConnected: Boolean(contact.lineUserId && contact.lineFollowing),
      lineAddFriendUrl: this.config.lineAvailable
        ? `https://line.me/R/ti/p/${encodeURIComponent(this.config.lineOaId)}`
        : null,
    };
  }

  async savePreferences(userId: string, value: NotificationSettings) {
    await this.officer(userId);
    const contact = await this.contacts.get(userId);
    if (
      (value.matchFound.email || value.statusChanged.email) &&
      (!this.emailSender || !contact.emailVerifiedAt)
    )
      throw new ConflictError('กรุณายืนยันอีเมลก่อนเปิดการแจ้งเตือนทางอีเมล');
    if (
      (value.matchFound.line || value.statusChanged.line) &&
      (!this.config.lineAvailable || !contact.lineUserId || !contact.lineFollowing)
    )
      throw new ConflictError('กรุณาเชื่อมต่อ LINE ก่อนเปิดการแจ้งเตือน');
    await this.contacts.savePreferences(userId, value);
    return this.settings(userId);
  }

  async requestEmail(userId: string, email: string) {
    await this.officer(userId);
    if (!this.emailSender) throw new ConflictError('ผู้ดูแลระบบยังไม่ได้ตั้งค่าการส่งอีเมล');
    const token = randomBytes(32).toString('base64url');
    await this.contacts.beginEmail(
      userId,
      email,
      tokenHash(token),
      new Date(this.now().getTime() + 30 * 60000),
    );
    const url = new URL('/notifications', this.config.webUrl);
    url.searchParams.set('verify_email', token);
    try {
      await this.emailSender.send(
        email,
        'ยืนยันอีเมลสำหรับการแจ้งเตือน Torfun',
        `ยืนยันอีเมลโดยเปิดลิงก์นี้ขณะเข้าสู่บัญชี Torfun ของคุณ (หมดอายุใน 30 นาที):\n${url.href}\nหากไม่ได้ร้องขอ คุณสามารถละเว้นอีเมลนี้ได้`,
        randomUUID(),
        renderAccountEmail(
          'ยืนยันอีเมลของคุณ',
          'รับแจ้งเตือนโอกาสงานซอฟต์แวร์และการเปลี่ยนสถานะ TOR ทางอีเมลของคุณ',
          url.href,
        ),
      );
    } catch {
      throw new ConflictError('ส่งอีเมลยืนยันไม่สำเร็จ กรุณาลองอีกครั้งภายหลัง');
    }
  }

  async verifyEmail(userId: string, token: string) {
    await this.officer(userId);
    if (!(await this.contacts.verifyEmail(userId, tokenHash(token), this.now())))
      throw new BadRequestError('ลิงก์ยืนยันหมดอายุ ถูกใช้แล้ว หรือไม่ใช่ของบัญชีนี้');
    return this.settings(userId);
  }

  async disconnect(userId: string, channel: 'email' | 'line') {
    await this.officer(userId);
    if (channel === 'email') await this.contacts.disconnectEmail(userId);
    else await this.contacts.disconnectLine(userId);
    const contact = await this.contacts.get(userId);
    contact.preferences.matchFound[channel] = false;
    contact.preferences.statusChanged[channel] = false;
    await this.contacts.savePreferences(userId, contact.preferences);
    return this.settings(userId);
  }

  async match(userId: string, projectId: string) {
    const user = await this.users.findById(userId);
    if (!user?.isActive) throw new UnauthorizedError();
    if (user.role === 'admin') return null;
    if (!user.companyId) return null;
    const tor = await this.source.get(projectId);
    if (!tor || !visibleForNotification(tor))
      throw new NotFoundError('ไม่มี TOR ที่เผยแพร่สำหรับเปรียบเทียบ');
    return computeMatch(
      user.companyId,
      tor,
      await this.experiences.listByCompany(user.companyId),
      this.now(),
    );
  }

  async failures(userId: string) {
    await this.administrator(userId);
    return this.store.failures();
  }
  async retry(userId: string, id: string) {
    await this.administrator(userId);
    if (!(await this.store.retry(id, this.now(), new Date(this.now().getTime() - 24 * 3600000))))
      throw new ConflictError(
        'รายการนี้ไม่สามารถลองใหม่ได้ หรือเกินช่วงป้องกันข้อความซ้ำ 24 ชั่วโมง',
      );
  }
}
