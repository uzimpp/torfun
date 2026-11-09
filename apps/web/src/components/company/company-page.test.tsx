import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import type { CompanyResponse } from '@/lib/api';
import { CompanyPage } from './company-page';
import { CompanyExperiences } from './company-experiences';

/**
 * Both frames put the same record on screen, so what is worth testing here is
 * only the difference between them: the registration flow shows where an
 * officer is and where they go next, and the standalone page shows neither.
 * Everything the record itself does is covered in `company-experiences.test`.
 */
vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return {
    ...actual,
    fetchMyCompany: vi.fn(),
    fetchCompanyQualifications: vi.fn(),
    saveCompanyQualifications: vi.fn(),
    fetchClients: vi.fn(),
    fetchExperiences: vi.fn(),
    fetchClientSuggestions: vi.fn(),
    searchCompanies: vi.fn(),
  };
});

const api = await import('@/lib/api');
const mocked = vi.mocked(api);

const company: CompanyResponse = {
  id: 'c1',
  name_th: 'บริษัท ทรู คอร์ปอเรชั่น จำกัด (มหาชน)',
  tin: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocked.fetchMyCompany.mockResolvedValue(company);
  mocked.fetchCompanyQualifications.mockResolvedValue({
    companyId: company.id,
    revision: null,
    certificates: [],
    personnel: [],
    registeredCapitalThb: null,
  });
  mocked.saveCompanyQualifications.mockImplementation(async (input) => input);
  mocked.fetchClients.mockResolvedValue({ clients: [] });
  mocked.fetchExperiences.mockResolvedValue({ experiences: [] });
});

afterEach(cleanup);

async function settled() {
  await waitFor(() => expect(mocked.fetchMyCompany).toHaveBeenCalled());
  await screen.findByLabelText('ชื่อบริษัท (ภาษาไทย)');
}

test('the standalone page is the record alone, with no flow around it', async () => {
  render(<CompanyPage />);
  await settled();

  expect(
    screen.queryByRole('navigation', { name: 'ขั้นตอนการตั้งค่าบัญชี' }),
  ).not.toBeInTheDocument();
  expect(screen.queryByRole('link', { name: /ไปที่แดชบอร์ด/ })).not.toBeInTheDocument();
  // Reading the record must not cost more requests than showing it once.
  expect(mocked.fetchMyCompany).toHaveBeenCalledOnce();
});

test('the registration frame adds the step indicator and the way on', async () => {
  render(<CompanyExperiences />);
  await settled();

  expect(screen.getByRole('navigation', { name: 'ขั้นตอนการตั้งค่าบัญชี' })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /ไปที่แดชบอร์ด/ })).toHaveAttribute('href', '/dashboard');
  expect(mocked.fetchMyCompany).toHaveBeenCalledOnce();
});

test('records a company certificate and a roster entry on the company page', async () => {
  const user = userEvent.setup();
  render(<CompanyPage />);
  await user.click(await screen.findByRole('button', { name: 'แก้ไขคุณสมบัติ' }));

  await user.click(screen.getByRole('button', { name: 'เพิ่มใบรับรองบริษัท' }));
  const certificate = within(screen.getByRole('group', { name: 'ใบรับรอง 1' }));
  await user.type(certificate.getByLabelText('ชื่อใบรับรอง'), 'Quality');
  await user.type(certificate.getByLabelText('มาตรฐาน'), 'ISO 9001');
  await user.type(certificate.getByLabelText('ผู้ออกใบรับรอง'), 'Issuer');
  await user.type(certificate.getByLabelText('ใช้ได้ถึง'), '2000-01-01');

  await user.click(screen.getByRole('button', { name: 'เพิ่มบุคลากร' }));
  const person = within(screen.getByRole('group', { name: 'บุคลากรคนที่ 1' }));
  await user.type(person.getByLabelText('บทบาท'), 'Developer');
  await user.type(person.getByLabelText('ใบรับรองบุคคล (คั่นด้วยจุลภาค)'), 'PMP');
  await user.click(screen.getByRole('button', { name: 'บันทึกคุณสมบัติ' }));

  expect(await screen.findByText(/หมดอายุ/)).toBeInTheDocument();
  expect(mocked.saveCompanyQualifications).toHaveBeenCalledWith(
    expect.objectContaining({
      companyId: company.id,
      certificates: [
        { name: 'Quality', standard: 'ISO 9001', issuer: 'Issuer', validUntil: '2000-01-01' },
      ],
      personnel: [
        { role: 'Developer', degree: null, yearsOfExperience: null, certificates: ['PMP'] },
      ],
    }),
  );
});
