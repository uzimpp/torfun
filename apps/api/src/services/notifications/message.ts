import { STATUS_LABELS, type Notification } from '@torfun/types';

export function notificationMessage(notification: Notification, webUrl: string) {
  const url = new URL(`/tor/${encodeURIComponent(notification.projectId)}`, webUrl).href;
  const settingsUrl = new URL('/notifications', webUrl).href;
  const title =
    notification.event === 'match_found'
      ? 'พบ TOR ที่ตรงกับผลงานบริษัท'
      : 'TOR ที่สนใจเปลี่ยนสถานะ';
  const lines = [
    title,
    notification.projectName,
    `คะแนนเทียบเทคโนโลยีและแพลตฟอร์ม: ${Math.round(notification.score * 100)}% (ค่าประมาณ)`,
    ...notification.reasons,
    `สถานะ: ${notification.previousStatus ? `${STATUS_LABELS[notification.previousStatus]} → ` : ''}${STATUS_LABELS[notification.status]}`,
    ...(notification.deadlineAt ? [`กำหนดส่งข้อเสนอจากสรุป AI: ${notification.deadlineAt}`] : []),
    'โปรดตรวจสอบคุณสมบัติและกำหนดเวลาจากเอกสารต้นฉบับก่อนยื่นข้อเสนอ',
    url,
    `จัดการการแจ้งเตือน: ${settingsUrl}`,
  ];
  return {
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
