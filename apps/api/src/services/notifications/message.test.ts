import { describe, expect, test } from 'bun:test';
import type { Notification } from '@torfun/types';
import { formatNotificationDeadline, limitText, notificationMessage } from './message';
import { renderAccountEmail, renderNotificationEmail } from './email-template';
import { renderLineAccountLink, renderNotificationLine } from './line-template';

const sample = (patch: Partial<Notification> = {}): Notification => ({
  id: 'test',
  userId: 'user',
  companyId: 'company',
  projectId: 'a/b?c',
  projectName: 'พัฒนาระบบข้อมูล <img src=x onerror="alert(1)">',
  event: 'match_found',
  score: 0.84,
  reasons: ['TypeScript & React', '<script>unsafe</script>'],
  previousStatus: null,
  status: 'open',
  deadlineAt: '2030-12-31',
  inApp: true,
  readAt: null,
  dismissedAt: null,
  createdAt: '2026-10-30T00:00:00Z',
  ...patch,
});

describe('notification presentation', () => {
  test('email escapes all evidence, preserves source/settings links and includes a text alternative', () => {
    const message = notificationMessage(sample(), 'https://torfun.example');
    const html = renderNotificationEmail(message);
    expect(html).toContain('lang="th"');
    expect(html).toContain('role="presentation"');
    expect(html).toContain('84%');
    expect(html).toContain('ค่าประมาณ');
    expect(html).toContain('ไม่ใช่การรับรองคุณสมบัติ');
    expect(html).toContain('&lt;img src=x onerror=&quot;alert(1)&quot;&gt;');
    expect(html).toContain('&lt;script&gt;unsafe&lt;/script&gt;');
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img');
    expect(html).toContain('https://torfun.example/tor/a%2Fb%3Fc');
    expect(html).toContain('href="https://torfun.example/notifications"');
    expect(html).toContain('เอกสาร TOR ต้นฉบับ');
    expect(message.text).toContain(message.url);
    expect(message.text).toContain('ค่าประมาณ');
  });
  test('status updates show both stages and never invent an unknown deadline', () => {
    const message = notificationMessage(
      sample({
        event: 'status_changed',
        previousStatus: 'open',
        status: 'awarded',
        deadlineAt: null,
      }),
      'https://torfun.example',
    );
    expect(message.statusLabel).toBe('เปิดรับข้อเสนอ → ประกาศผู้ชนะแล้ว');
    expect(renderNotificationEmail(message)).toContain('ยังไม่ทราบกำหนดเวลา');
    expect(JSON.stringify(renderNotificationLine(message))).toContain(message.statusLabel);
    expect(formatNotificationDeadline('2026-02-30')).toContain('อ่านกำหนดเวลาไม่ชัดเจน');
    expect(formatNotificationDeadline('not a date')).toContain('อ่านกำหนดเวลาไม่ชัดเจน');
    expect(formatNotificationDeadline('2026-10-30')).toContain('2569');
    expect(formatNotificationDeadline('2026-10-30T18:00:00Z')).toContain('31');
  });
  test('LINE cards remain within API limits with long titles and many reasons', () => {
    const message = notificationMessage(
      sample({
        projectName: '🙂'.repeat(2000),
        reasons: Array.from({ length: 30 }, () => 'ข้อมูล'.repeat(500)),
      }),
      'https://torfun.example',
    );
    const flex = renderNotificationLine(message);
    expect(flex.altText.length).toBeLessThanOrEqual(400);
    expect(Buffer.byteLength(JSON.stringify(flex.contents))).toBeLessThan(30000);
    expect(flex.contents.footer.contents).toHaveLength(2);
    const serialized = JSON.stringify(flex);
    expect(serialized).toContain('ตั้งค่าการแจ้งเตือน');
    expect(serialized).toContain('เอกสาร TOR ต้นฉบับ');
    expect(serialized).toContain(message.url);
    expect(serialized).toContain('ดูเหตุผลเพิ่มเติม');
    expect(limitText('🙂'.repeat(5), 4)).toBe('🙂…');
  });
  test('verification and LINE linking keep their original one-time destinations and expiry context', () => {
    const url = 'https://torfun.example/notifications?verify_email=one&key=two';
    expect(renderAccountEmail('ยืนยันอีเมล', 'ตั้งค่าบัญชี', url)).toContain('one&amp;key=two');
    expect(renderAccountEmail('ยืนยันอีเมล', 'ตั้งค่าบัญชี', url)).toContain('30 นาที');
    const line = renderLineAccountLink(
      'https://torfun.example/notifications/link-line?link_token=once',
    );
    expect(JSON.stringify(line)).toContain('10 นาที');
    expect(JSON.stringify(line)).toContain('link_token=once');
  });
});
