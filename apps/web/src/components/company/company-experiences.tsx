'use client';

import { FlowShell } from '@/components/onboarding/flow-shell';
import { CompanyRecord } from './company-record';
import { useCompanyData } from './use-company-data';

/**
 * The company record inside the registration flow.
 *
 * A frame and nothing else: the step indicator, the heading, and the record
 * itself. `/company` puts the same record on an ordinary page — see
 * `CompanyRecord` for why the difference between the two is one flag.
 */
export function CompanyExperiences() {
  const data = useCompanyData();

  // "Saved on the server", not "typed into the field": an Experience is written
  // against a company id, and there is no id until the API has one.
  const companySaved = data.company !== null;

  return (
    <FlowShell
      // Saving the company is what finishes step two: an Experience is written
      // against a company id, so until one exists there is nothing step three
      // could record.
      step={companySaved ? 'experiences' : 'company'}
      width="wide"
      title="บริษัทและผลงานของคุณ"
      description="บันทึกบริษัทของคุณและผลงานที่เคยส่งมอบ เพื่อใช้เทียบกับสิ่งที่ประกาศ TOR ต้องการ"
    >
      <CompanyRecord data={data} onboarding />
    </FlowShell>
  );
}
