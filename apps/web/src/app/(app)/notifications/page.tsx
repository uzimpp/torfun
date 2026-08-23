import Link from 'next/link';
import { Bell } from 'lucide-react';
const notifications = [
  {
    title: 'พบ TOR ที่มีความเหมาะสมสูง',
    detail: 'ระบบบริหารจัดการข้อมูลโรงพยาบาล มีคะแนนความเหมาะสม 87%',
    href: '/tors/bma-hospital-data-2027',
  },
  {
    title: 'ใกล้ถึงกำหนดส่ง',
    detail: 'ระบบบริการประชาชนออนไลน์ มีกำหนดส่งภายใน 14 วัน',
    href: '/tors/bma-citizen-services-2027',
  },
];
export default function NotificationsPage() {
  return (
    <section className="mx-auto max-w-[900px]">
      <div className="flex items-center gap-3">
        <span className="grid size-11 place-items-center rounded-xl bg-[#eaf0fb] text-[#385783]">
          <Bell className="size-5" />
        </span>
        <div>
          <h1 className="text-3xl font-semibold tracking-[-0.035em] text-[#121b2e]">
            การแจ้งเตือน
          </h1>
          <p className="mt-1 text-sm text-[#68758a]">อัปเดต TOR ที่ควรติดตาม</p>
        </div>
      </div>
      <div className="mt-7 grid gap-3">
        {notifications.map((notification) => (
          <Link
            key={notification.title}
            href={notification.href}
            className="rounded-xl border border-[#e1e5ed] bg-white p-5 transition hover:border-[#cbd5e3] hover:shadow-[0_8px_18px_rgba(31,41,66,0.06)]"
          >
            <h2 className="font-semibold">{notification.title}</h2>
            <p className="mt-1 text-sm text-[#647186]">{notification.detail}</p>
          </Link>
        ))}
      </div>
    </section>
  );
}
