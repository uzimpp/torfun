import type { Metadata } from 'next';
import { requireAdmin } from '@/lib/auth';
import { TorReportsConsole } from '@/components/admin/tor-reports-console';

export const metadata: Metadata = {
  title: 'รายงาน TOR จากผู้ใช้ | TOR Finder',
  description: 'รายงาน TOR ที่รอผู้ดูแลระบบตรวจสอบ',
};

export default async function TorReportsPage() {
  await requireAdmin();
  return <TorReportsConsole />;
}
