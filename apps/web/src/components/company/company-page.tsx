'use client';

import { CompanyRecord } from './company-record';
import { useCompanyData } from './use-company-data';

/**
 * The company record as an ordinary page, reached from the account menu.
 *
 * No step indicator and no way on: an officer who came here to correct one line
 * is not part-way through anything, and telling them where to go next would be
 * answering a question they did not ask.
 */
export function CompanyPage() {
  const data = useCompanyData();
  return <CompanyRecord data={data} />;
}
