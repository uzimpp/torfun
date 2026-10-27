import type { Metadata } from 'next';
import { AccountsConsole } from '@/components/admin/accounts-console';
import { requireAdmin } from '@/lib/auth';

export const metadata: Metadata = {
  title: 'จัดการบัญชีผู้ใช้ | TOR Finder',
  description: 'หน้าสำหรับผู้ดูแลระบบ ให้หรือถอนสิทธิ์ผู้ดูแล และเปิดหรือระงับการใช้งานบัญชี',
};

export default async function AccountsPage() {
  // The API enforces this too; the check here is so a non-admin gets a redirect
  // instead of a console that renders and then fills with 403s.
  const admin = await requireAdmin();

  return <AccountsConsole currentUserId={admin.id} />;
}
