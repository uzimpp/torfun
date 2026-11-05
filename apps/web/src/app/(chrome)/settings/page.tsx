import type { Metadata } from 'next';

import { AccountSettings } from '@/components/auth/account-settings';
import { requireUser } from '@/lib/auth';

export const metadata: Metadata = { title: 'ตั้งค่าบัญชี | Torfun' };

export default async function SettingsPage() {
  const { id, username, first_name, last_name, has_local_password } = await requireUser();

  return (
    <main className="page-fill mx-auto w-full max-w-3xl px-5 py-10 sm:px-8 lg:py-14">
      <h1 className="text-2xl font-medium tracking-tight">ตั้งค่าบัญชี</h1>
      <p className="text-muted-foreground mt-2">จัดการข้อมูลส่วนตัวและรหัสผ่าน Torfun ของคุณ</p>
      <AccountSettings key={id} user={{ username, first_name, last_name, has_local_password }} />
    </main>
  );
}
