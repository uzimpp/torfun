import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import type { MyCompanyResponse } from '@/lib/api';
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
    fetchMyJoinRequest: vi.fn(),
    fetchCompanyMembers: vi.fn(),
    fetchJoinRequests: vi.fn(),
    answerJoinRequest: vi.fn(),
    setAutoApproveDomain: vi.fn(),
  };
});

const api = await import('@/lib/api');
const mocked = vi.mocked(api);

const company: MyCompanyResponse = {
  id: 'c1',
  name_th: 'บริษัท ทรู คอร์ปอเรชั่น จำกัด (มหาชน)',
  tin: null,
  is_manager: true,
  auto_approve_domain: null,
};

const manager = {
  id: 'u1',
  username: 'alice',
  first_name: 'Alice',
  last_name: 'Manager',
  is_manager: true,
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
  mocked.fetchMyJoinRequest.mockResolvedValue(null);
  mocked.fetchCompanyMembers.mockResolvedValue({ members: [manager] });
  mocked.fetchJoinRequests.mockResolvedValue({ requests: [] });
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

test('a Company Manager sees who is asking to join and can approve them', async () => {
  const user = userEvent.setup();
  mocked.fetchJoinRequests.mockResolvedValue({
    requests: [
      {
        user_id: 'u2',
        username: 'bob',
        first_name: 'Bob',
        last_name: 'Newcomer',
        email: 'bob@true.co.th',
        requested_at: '2026-11-18T08:00:00.000Z',
      },
    ],
  });
  mocked.answerJoinRequest.mockResolvedValue();
  render(<CompanyPage />);

  expect(await screen.findByText(/bob@true\.co\.th/)).toBeInTheDocument();
  // The verified email is labelled as such, apart from the free-text username.
  expect(screen.getByText(/อีเมลที่ยืนยันแล้ว \(Google\)/)).toBeInTheDocument();
  expect(screen.getByText('ชื่อผู้ใช้: bob')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'อนุมัติ bob' }));
  await waitFor(() => expect(mocked.answerJoinRequest).toHaveBeenCalledWith('u2', 'approve'));
});

test('a public mail domain is refused before it reaches the API', async () => {
  const user = userEvent.setup();
  render(<CompanyPage />);

  await user.type(await screen.findByLabelText('โดเมนอีเมลของบริษัท'), 'gmail.com');
  await user.click(screen.getByRole('button', { name: 'เปิดอนุมัติอัตโนมัติ' }));

  expect(await screen.findByText(/ใช้โดเมนอีเมลสาธารณะ/)).toBeInTheDocument();
  expect(mocked.setAutoApproveDomain).not.toHaveBeenCalled();
});

test('a plain member sees colleagues but no requests and no controls', async () => {
  mocked.fetchMyCompany.mockResolvedValue({ ...company, is_manager: false });
  render(<CompanyPage />);

  expect(await screen.findByText('alice')).toBeInTheDocument();
  expect(screen.queryByText('คำขอเข้าร่วม')).not.toBeInTheDocument();
  expect(screen.queryByLabelText('โดเมนอีเมลของบริษัท')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /นำ .* ออกจากบริษัท/ })).not.toBeInTheDocument();
  // The API would refuse it anyway; the page does not ask.
  expect(mocked.fetchJoinRequests).not.toHaveBeenCalled();
});
