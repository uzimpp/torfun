import { escapeHtml, type NotificationMessage } from './message';

const INK = '#242333';
const MUTED = '#666477';
const PURPLE = '#3729b7';
const FONT = 'Tahoma,Arial,sans-serif';

/** Email-safe layout: inline styles, presentation tables and no remote assets. */
function shell(title: string, preview: string, content: string, settingsUrl?: string): string {
  return `<!doctype html>
<html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(title)}</title></head>
<body style="margin:0;padding:0;background-color:#f5f5f9;color:${INK};font-family:${FONT};-webkit-text-size-adjust:100%">
<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all">${escapeHtml(preview)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f5f5f9"><tr><td align="center" style="padding:24px 12px">
<!--[if mso]><table role="presentation" width="600"><tr><td><![endif]-->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;border-collapse:separate;background-color:#ffffff;border:1px solid #e6e5ee;border-radius:16px;overflow:hidden">
<tr><td style="padding:24px 28px;border-top:5px solid ${PURPLE};border-bottom:1px solid #eeedf4"><a href="${escapeHtml(settingsUrl ?? '#content')}" style="font-family:${FONT};font-size:26px;font-weight:bold;letter-spacing:-0.5px;color:${PURPLE};text-decoration:none">Torfun<span style="color:#9591b1">.</span></a><p style="margin:2px 0 0;font-size:12px;line-height:1.8;color:${MUTED}">โอกาสงานซอฟต์แวร์ภาครัฐ สำหรับทีมของคุณ</p></td></tr>
<tr><td id="content" style="padding:28px;overflow-wrap:anywhere;word-break:break-word;line-height:1.85">${content}</td></tr>
<tr><td style="padding:20px 28px;background-color:#faf9fc;border-top:1px solid #eeedf4;font-size:12px;line-height:1.9;color:${MUTED}">ส่งจากระบบแจ้งเตือน Torfun${settingsUrl ? `<br><a href="${escapeHtml(settingsUrl)}" style="color:${PURPLE};text-decoration:underline">จัดการช่องทางและประเภทการแจ้งเตือน</a>` : ''}</td></tr>
</table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr></table></body></html>`;
}

function button(label: string, url: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:24px"><tr><td bgcolor="${PURPLE}" style="border-radius:8px;mso-padding-alt:14px 24px"><a href="${escapeHtml(url)}" style="display:inline-block;padding:14px 24px;border:1px solid ${PURPLE};border-radius:8px;font-family:${FONT};font-size:16px;font-weight:bold;line-height:1.5;color:#ffffff;text-decoration:none">${escapeHtml(label)}</a></td></tr></table>`;
}

function fact(label: string, value: string): string {
  return `<tr><td style="padding:14px 0;border-bottom:1px solid #eeedf4"><p style="margin:0 0 4px;font-size:12px;color:${MUTED}">${escapeHtml(label)}</p><p style="margin:0;font-size:15px;line-height:1.85;color:${INK}">${escapeHtml(value)}</p></td></tr>`;
}

export function renderNotificationEmail(message: NotificationMessage): string {
  const content = `<p style="margin:0 0 14px;font-size:13px;font-weight:bold;color:${PURPLE}">${escapeHtml(message.title)}</p>
<h1 style="margin:0 0 24px;font-size:24px;line-height:1.65;font-weight:bold;color:${INK}">${escapeHtml(message.projectName)}</h1>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding:20px;background-color:#f0eefb;border-left:4px solid ${PURPLE}"><p style="margin:0;font-size:12px;color:${MUTED}">คะแนนเทียบเทคโนโลยีและแพลตฟอร์ม</p><p style="margin:4px 0;font-size:34px;font-weight:bold;line-height:1.4;color:${PURPLE}">${message.scorePercent}% <span style="font-size:13px;font-weight:normal;color:${MUTED}">ค่าประมาณจากผลงานบริษัท</span></p><p style="margin:0;font-size:12px;color:${MUTED}">คะแนนนี้ไม่ใช่การรับรองคุณสมบัติในการยื่นข้อเสนอ</p></td></tr></table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:12px">${fact(message.event === 'status_changed' ? 'การเปลี่ยนสถานะ' : 'สถานะประกาศ', message.statusLabel)}${fact('กำหนดยื่นข้อเสนอ · โปรดตรวจสอบต้นฉบับ', message.deadlineLabel)}</table>
${message.reasons.length ? `<h2 style="margin:24px 0 8px;font-size:15px;color:${INK}">สิ่งที่ตรงกับผลงานบริษัท</h2><ul style="margin:0;padding-left:20px;font-size:14px;line-height:1.9;color:${MUTED}">${message.reasons.map((reason) => `<li style="margin:0 0 6px">${escapeHtml(reason)}</li>`).join('')}</ul>` : ''}
${button('เปิดรายละเอียด TOR', message.url)}
<p style="margin:20px 0 0;font-size:12px;line-height:1.9;color:${MUTED}">สรุปและคะแนนเป็นข้อมูลช่วยพิจารณา โปรดตรวจสอบคุณสมบัติ กำหนดเวลา และเอกสาร TOR ต้นฉบับก่อนยื่นข้อเสนอ</p>
<p style="margin:16px 0 0;font-size:11px;line-height:1.8;color:${MUTED};word-break:break-all">หากเปิดปุ่มไม่ได้ ให้ใช้ลิงก์นี้:<br><a href="${escapeHtml(message.url)}" style="color:${PURPLE}">${escapeHtml(message.url)}</a></p>`;
  return shell(
    message.subject,
    `${message.title} · ${message.projectName}`,
    content,
    message.settingsUrl,
  );
}

export function renderAccountEmail(title: string, text: string, url: string): string {
  return shell(
    title,
    text,
    `<p style="margin:0 0 12px;font-size:13px;color:${PURPLE};font-weight:bold">ตั้งค่าการแจ้งเตือน</p><h1 style="margin:0 0 18px;font-size:24px;line-height:1.65">${escapeHtml(title)}</h1><p style="margin:0;font-size:15px;line-height:1.9;color:${MUTED}">${escapeHtml(text)}</p>${button('ยืนยันอีเมล', url)}<p style="margin:20px 0 0;font-size:12px;line-height:1.9;color:${MUTED}">ลิงก์หมดอายุใน 30 นาที กรุณาเปิดขณะเข้าสู่บัญชี Torfun ของคุณ หากไม่ได้ร้องขอ คุณสามารถละเว้นอีเมลนี้ได้</p><p style="font-size:11px;word-break:break-all"><a href="${escapeHtml(url)}" style="color:${PURPLE}">${escapeHtml(url)}</a></p>`,
  );
}

/** Safe branded fallback for service messages that only supply plain text. */
export function renderTextEmail(title: string, text: string, webUrl: string): string {
  const origin = new URL(webUrl).origin;
  const paragraphs = text
    .split('\n')
    .map((line) => {
      const escaped = escapeHtml(line);
      let internal = false;
      try {
        const url = new URL(line);
        internal =
          ['http:', 'https:'].includes(url.protocol) && url.origin === origin && !/\s/.test(line);
      } catch {
        /* Ordinary prose stays text. */
      }
      return `<p style="margin:0 0 16px;font-size:15px;line-height:1.9;word-break:break-word">${internal ? `<a href="${escaped}" style="color:${PURPLE}">เปิด Torfun</a>` : escaped}</p>`;
    })
    .join('');
  return shell(
    title,
    title,
    `<h1 style="margin:0 0 20px;font-size:24px;line-height:1.65">${escapeHtml(title)}</h1>${paragraphs}`,
  );
}
