import { STATUS_LABELS, type Notification } from '@torfun/types';

export function notificationMessage(notification: Notification, webUrl: string) {
  const url = new URL(`/tor/${encodeURIComponent(notification.projectId)}`, webUrl).href;
  const settingsUrl = new URL('/settings', webUrl).href;
  const title =
    notification.event === 'match_found'
      ? 'พบ TOR ที่ตรงกับผลงานบริษัท'
      : notification.event === 'new_open'
        ? 'TOR เปิดรับข้อเสนอใหม่'
        : 'TOR ที่สนใจเปลี่ยนสถานะหรือกำหนดเวลา';
  const scoreLabel =
    notification.scoringVersion === 'qualification-clauses-v1' || notification.score === null
      ? 'คะแนนคุณสมบัติจาก TOR'
      : 'คะแนนเทียบเทคโนโลยีและแพลตฟอร์ม';
  const scorePercent = notification.score === null ? null : Math.round(notification.score * 100);
  const scoreText = scorePercent === null ? 'ยังไม่มีคะแนนคุณสมบัติ' : `${scorePercent}%`;
  const statusLabel = `${notification.previousStatus ? `${STATUS_LABELS[notification.previousStatus]} → ` : ''}${STATUS_LABELS[notification.status]}`;
  const deadlineLabel = formatNotificationDeadline(notification.deadlineAt);
  const lines = [
    title,
    notification.projectName,
    `${scoreLabel}: ${scoreText} (ค่าประมาณ)`,
    ...notification.reasons,
    `สถานะ: ${notification.previousStatus ? `${STATUS_LABELS[notification.previousStatus]} → ` : ''}${STATUS_LABELS[notification.status]}`,
    `กำหนดยื่นข้อเสนอ (โปรดตรวจสอบต้นฉบับ): ${deadlineLabel}`,
    'โปรดตรวจสอบคุณสมบัติและกำหนดเวลาจากเอกสารต้นฉบับก่อนยื่นข้อเสนอ',
    url,
    `จัดการการแจ้งเตือน: ${settingsUrl}`,
  ];
  return {
    title,
    event: notification.event,
    projectName: notification.projectName,
    scorePercent,
    scoreText,
    scoreLabel,
    statusLabel,
    deadlineLabel,
    reasons: notification.reasons,
    subject: `${title}: ${notification.projectName}`.replace(/[\r\n]/g, ' ').slice(0, 250),
    text: lines.join('\n'),
    url,
    settingsUrl,
  };
}

export const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!,
  );

export type NotificationMessage = ReturnType<typeof notificationMessage>;

/** Respect Thai calendar days; an absent or invalid deadline is never guessed. */
export function formatNotificationDeadline(value: string | null): string {
  if (!value) return 'ยังไม่ทราบกำหนดเวลา';
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const date = new Date(dateOnly ? `${value}T00:00:00+07:00` : value);
  if (
    !Number.isFinite(date.getTime()) ||
    (dateOnly &&
      new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Bangkok',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(date) !== value)
  )
    return 'อ่านกำหนดเวลาไม่ชัดเจน — โปรดตรวจสอบต้นฉบับ';
  return new Intl.DateTimeFormat('th-TH', {
    dateStyle: 'long',
    ...(dateOnly ? {} : { timeStyle: 'short' as const }),
    timeZone: 'Asia/Bangkok',
  }).format(date);
}

export function limitText(value: string, maximum: number): string {
  return value.length <= maximum
    ? value
    : `${value.slice(0, maximum - 1).replace(/[\uD800-\uDBFF]$/u, '')}…`;
}
