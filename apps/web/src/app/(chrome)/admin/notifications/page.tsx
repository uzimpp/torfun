import type { Metadata } from 'next';
import { requireAdmin } from '@/lib/auth';
import { DeliveryLog } from '@/components/notifications/delivery-log';
export const metadata: Metadata = { title: 'บันทึกการส่งแจ้งเตือน | Torfun' };
export default async function NotificationDeliveryPage() {
  await requireAdmin();
  return (
    <main className="page-fill mx-auto w-full max-w-5xl px-5 py-10 sm:px-8">
      <h1 className="text-2xl font-semibold tracking-tight">บันทึกการส่งแจ้งเตือน</h1>
      <p className="text-muted-foreground mt-3 text-sm">
        การส่งอีเมลและ LINE ที่ต้องตรวจสอบ ความล้มเหลวแต่ละช่องทางไม่กระทบกล่องข้อความในระบบ
        ลองใหม่ได้ภายใน 24 ชั่วโมง
      </p>
      <DeliveryLog />
    </main>
  );
}
