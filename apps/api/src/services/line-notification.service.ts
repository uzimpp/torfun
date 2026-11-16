import { createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';
import { BadRequestError, ConflictError, UnauthorizedError } from '../core/errors';
import type { NotificationContactStore } from '../repositories/notification-contact.repository';
import type { NotificationService } from './notification.service';
import type { LineSender } from './notifications/line';
import { renderLineAccountLink } from './notifications/line-template';
import { validLineSignature } from './notifications/line';

const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const WebhookSchema = z.object({
  events: z
    .array(
      z
        .object({
          webhookEventId: z.string().min(1).max(200),
          type: z.string(),
          source: z
            .object({
              type: z.string(),
              userId: z
                .string()
                .regex(/^U[0-9a-f]{32}$/)
                .optional(),
            })
            .optional(),
          replyToken: z.string().optional(),
          message: z.object({ type: z.string(), text: z.string().optional() }).optional(),
          link: z.object({ result: z.string(), nonce: z.string() }).optional(),
        })
        .passthrough(),
    )
    .max(100),
});

export class LineNotificationService {
  constructor(
    private readonly contacts: NotificationContactStore,
    private readonly notifications: Pick<NotificationService, 'officer'>,
    private readonly line: LineSender | null,
    private readonly config: { secret: string; webUrl: string },
    private readonly now: () => Date = () => new Date(),
  ) {}

  async beginLink(userId: string, linkToken: string): Promise<string> {
    await this.notifications.officer(userId);
    if (!this.line) throw new ConflictError('ผู้ดูแลระบบยังไม่ได้ตั้งค่า LINE Official Account');
    const nonce = randomBytes(32).toString('base64url');
    await this.contacts.saveNonce(userId, hash(nonce), new Date(this.now().getTime() + 10 * 60000));
    const url = new URL('https://access.line.me/dialog/bot/accountLink');
    url.searchParams.set('linkToken', linkToken);
    url.searchParams.set('nonce', nonce);
    return url.href;
  }

  async webhook(raw: string, signature: string): Promise<void> {
    if (!this.line || !this.config.secret) throw new ConflictError('LINE is not configured');
    if (!validLineSignature(raw, signature, this.config.secret))
      throw new UnauthorizedError('Invalid LINE webhook signature');
    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      throw new BadRequestError('Invalid webhook JSON');
    }
    const parsed = WebhookSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestError('Invalid LINE webhook event');
    for (const event of parsed.data.events) {
      const claim = await this.contacts.claimWebhook(event.webhookEventId, this.now());
      if (claim.kind === 'done') continue;
      if (claim.kind === 'busy') throw new ConflictError('Webhook processing is still in progress');
      const lease = claim.token;
      const lineUserId = event.source?.type === 'user' ? event.source.userId : undefined;
      if (lineUserId) {
        if (event.type === 'unfollow') await this.contacts.setFollowing(lineUserId, false);
        if (event.type === 'follow') await this.contacts.setFollowing(lineUserId, true);
        if (event.type === 'accountLink' && event.link?.result === 'ok') {
          const nonceHash = hash(event.link.nonce);
          const userId = await this.contacts.nonceUser(nonceHash, this.now());
          if (userId) {
            try {
              await this.notifications.officer(userId);
            } catch {
              await this.contacts.finishWebhook(event.webhookEventId, lease);
              continue;
            }
            const linked = await this.contacts.linkLine(nonceHash, lineUserId, this.now());
            if (!linked)
              throw new ConflictError('LINE นี้ถูกเชื่อมกับบัญชีอื่นแล้ว หรือคำขอหมดอายุ');
          }
        }
        const text = event.message?.text?.trim().toLowerCase();
        if (
          event.replyToken &&
          (event.type === 'follow' ||
            (event.type === 'message' &&
              ['link', 'เชื่อมต่อ', 'เชื่อมต่อบัญชี'].includes(text ?? '')))
        ) {
          const linkToken = await this.line.linkToken(lineUserId);
          const url = new URL('/notifications/link-line', this.config.webUrl);
          url.searchParams.set('link_token', linkToken);
          await this.line.reply(
            event.replyToken,
            `เชื่อมต่อบัญชี Torfun ภายใน 10 นาที:\n${url.href}\nเข้าสู่บัญชีของคุณและกดยืนยัน คุณสามารถยกเลิกการเชื่อมต่อได้ทุกเมื่อในหน้าการแจ้งเตือน`,
            renderLineAccountLink(url.href),
          );
        }
      }
      await this.contacts.finishWebhook(event.webhookEventId, lease);
    }
  }
}
