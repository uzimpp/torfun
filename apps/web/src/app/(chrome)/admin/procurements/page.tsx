import type { Metadata } from 'next';
import { parseProcurementFilters } from '@/components/procurements/procurement-filter-values';
import { ProcurementsBrowser } from '@/components/procurements/procurements-browser';
import { requireAdmin } from '@/lib/auth';

export const metadata: Metadata = {
  title: 'ประกาศที่ดึงเข้าระบบ | TOR Finder',
  description: 'หน้าสำหรับผู้ดูแลระบบ ค้นและจัดการประกาศที่ดึงจากระบบ e-GP',
};

export default async function ProcurementsPage({ searchParams }: PageProps<'/admin/procurements'>) {
  // The API enforces this too; here so a non-admin is redirected rather than shown 403s.
  await requireAdmin();
  const url = parseProcurementFilters(await searchParams);

  return <ProcurementsBrowser initialUrl={url} />;
}
