import { limitText, type NotificationMessage } from './message';

interface Text {
  type: 'text';
  text: string;
  size?: 'xs' | 'sm' | 'md' | 'xl' | 'xxl';
  weight?: 'bold';
  color?: string;
  wrap?: boolean;
  margin?: 'sm' | 'md' | 'lg';
}
interface Box {
  type: 'box';
  layout: 'vertical';
  contents: Component[];
  spacing?: 'sm' | 'md' | 'lg';
  paddingAll?: string;
  backgroundColor?: string;
}
interface Button {
  type: 'button';
  style: 'primary' | 'link';
  color?: string;
  height: 'sm';
  action: { type: 'uri'; label: string; uri: string };
}
type Component = Text | Box | Button | { type: 'separator'; margin?: 'lg'; color?: string };
export interface LineFlexMessage {
  type: 'flex';
  altText: string;
  contents: { type: 'bubble'; size: 'mega'; header: Box; body: Box; footer: Box };
}
const text = (value: string, options: Omit<Text, 'type' | 'text'> = {}): Text => ({
  type: 'text',
  text: limitText(value || '—', 1500),
  size: 'sm',
  color: '#666477',
  wrap: true,
  ...options,
});
const action = (label: string, uri: string, primary = true): Button => ({
  type: 'button',
  style: primary ? 'primary' : 'link',
  color: '#3729b7',
  height: 'sm',
  action: { type: 'uri', label, uri },
});
function card(
  label: string,
  altText: string,
  body: Component[],
  actions: Button[],
): LineFlexMessage {
  return {
    type: 'flex',
    altText: limitText(altText, 400),
    contents: {
      type: 'bubble',
      size: 'mega',
      header: {
        type: 'box',
        layout: 'vertical',
        paddingAll: '20px',
        backgroundColor: '#3729b7',
        spacing: 'sm',
        contents: [
          text('Torfun.', { size: 'xl', weight: 'bold', color: '#ffffff' }),
          text(label, { size: 'xs', color: '#e7e3ff' }),
        ],
      },
      body: { type: 'box', layout: 'vertical', paddingAll: '20px', spacing: 'md', contents: body },
      footer: {
        type: 'box',
        layout: 'vertical',
        paddingAll: '20px',
        spacing: 'sm',
        contents: actions,
      },
    },
  };
}
export function renderNotificationLine(message: NotificationMessage): LineFlexMessage {
  return card(
    message.title,
    `${message.title}: ${message.projectName}`,
    [
      text(limitText(message.projectName, 600), { size: 'xl', weight: 'bold', color: '#242333' }),
      {
        type: 'box',
        layout: 'vertical',
        paddingAll: '16px',
        backgroundColor: '#f0eefb',
        spacing: 'sm',
        contents: [
          text('คะแนนเทียบเทคโนโลยีและแพลตฟอร์ม', { size: 'xs' }),
          text(`${message.scorePercent}% · ค่าประมาณ`, {
            size: 'xxl',
            weight: 'bold',
            color: '#3729b7',
          }),
          text('ไม่ใช่การรับรองคุณสมบัติยื่นข้อเสนอ', { size: 'xs' }),
        ],
      },
      text(message.event === 'status_changed' ? 'การเปลี่ยนสถานะ' : 'สถานะประกาศ', { size: 'xs' }),
      text(message.statusLabel, { color: '#242333', weight: 'bold' }),
      text('กำหนดยื่นข้อเสนอ · โปรดตรวจสอบต้นฉบับ', { size: 'xs' }),
      text(message.deadlineLabel, { color: '#242333' }),
      ...(message.reasons.length
        ? [
            text('สิ่งที่ตรงกับผลงานบริษัท', { weight: 'bold', color: '#242333' }),
            ...message.reasons.slice(0, 3).map((reason) => text(`• ${limitText(reason, 240)}`)),
            ...(message.reasons.length > 3
              ? [text('ดูเหตุผลเพิ่มเติมใน Torfun', { size: 'xs' })]
              : []),
          ]
        : []),
      { type: 'separator', margin: 'lg', color: '#e6e5ee' },
      text('โปรดตรวจสอบคุณสมบัติ กำหนดเวลา และเอกสาร TOR ต้นฉบับก่อนยื่นข้อเสนอ', { size: 'xs' }),
    ],
    [action('เปิด TOR', message.url), action('ตั้งค่าการแจ้งเตือน', message.settingsUrl, false)],
  );
}
export function renderLineAccountLink(url: string): LineFlexMessage {
  return card(
    'เชื่อมต่อบัญชี',
    'เชื่อมต่อ LINE กับ Torfun ภายใน 10 นาที',
    [
      text('รับโอกาสที่ตรงกับทีมของคุณ', { size: 'xl', weight: 'bold', color: '#242333' }),
      text('เข้าสู่บัญชี Torfun ของคุณ แล้วกดยืนยันเพื่อเชื่อมต่อ LINE นี้'),
      text('ลิงก์หมดอายุใน 10 นาที', { weight: 'bold', color: '#3729b7' }),
      text('คุณเลือกประเภทข้อความหรือยกเลิกการเชื่อมต่อได้ทุกเมื่อในหน้าการแจ้งเตือน', {
        size: 'xs',
      }),
    ],
    [action('เชื่อมต่อบัญชี', url)],
  );
}
