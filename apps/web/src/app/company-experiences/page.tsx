import type { Metadata } from 'next';

import { CompanyExperiences } from '@/components/company/company-experiences';
import { requireUser } from '@/lib/auth';

export const metadata: Metadata = {
  title: 'บริษัทและผลงานของคุณ | TOR Finder',
  description: 'บันทึกบริษัทและผลงานที่เคยส่งมอบ เพื่อใช้เทียบกับสิ่งที่ประกาศ TOR ต้องการ',
};

export default async function CompanyExperiencesPage() {
  // `requireUser`, deliberately not `requireCompany`: this is the page an
  // officer without a Company is sent to, so gating it on having one would
  // redirect it to itself forever.
  await requireUser();

  return <CompanyExperiences />;
}
