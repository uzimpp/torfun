import type { Metadata } from 'next';

import { CompanyPage } from '@/components/company/company-page';
import { requireUser } from '@/lib/auth';

export const metadata: Metadata = {
  title: 'บริษัทและผลงาน | Torfun',
  description: 'แก้ไขข้อมูลบริษัทและผลงานที่เคยส่งมอบ เพื่อใช้เทียบกับสิ่งที่ประกาศ TOR ต้องการ',
};

/**
 * The company record, opened later to change something.
 *
 * `requireUser`, deliberately not `requireCompany`: an officer with no Company
 * yet is not turned away, they are shown the same block that creates one. The
 * registration flow at `/company-experiences` remains the guided version of
 * exactly this, which is where `requireCompany` still sends anyone who arrives
 * at the product without a record.
 */
export default async function Company() {
  await requireUser();

  return (
    <main className="page-fill mx-auto w-full max-w-4xl px-5 py-10 sm:px-8 lg:py-14">
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">บริษัทและผลงาน</h1>
      <p className="text-muted-foreground mt-2 max-w-xl">
        ข้อมูลนี้คือสิ่งที่ระบบนำไปเทียบกับข้อกำหนดในประกาศ TOR แก้ไขได้ทุกเมื่อ
      </p>

      <div className="mt-8">
        <CompanyPage />
      </div>
    </main>
  );
}
