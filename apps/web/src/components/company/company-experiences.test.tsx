import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import type { ClientResponse, CompanyResponse, ExperienceResponse } from '@/lib/api';
import { CompanyExperiences } from './company-experiences';

/**
 * The API does not exist as far as these tests are concerned; what is being
 * checked is what an officer can see and do on the page. Everything is stubbed
 * at the client boundary so the assertions stay about rendered text, accessible
 * names and whether a save was actually attempted.
 */
vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return {
    ...actual,
    fetchMyCompany: vi.fn(),
    fetchClients: vi.fn(),
    fetchExperiences: vi.fn(),
    createCompany: vi.fn(),
    updateMyCompany: vi.fn(),
    joinCompany: vi.fn(),
    searchCompanies: vi.fn(),
    createClient: vi.fn(),
    updateClient: vi.fn(),
    deleteClient: vi.fn(),
    fetchClientSuggestions: vi.fn(),
    createExperience: vi.fn(),
    updateExperience: vi.fn(),
    deleteExperience: vi.fn(),
  };
});

const api = await import('@/lib/api');
const mocked = vi.mocked(api);

const TRUE_CORP = 'บริษัท ทรู คอร์ปอเรชั่น จำกัด (มหาชน)';

const revenue: ClientResponse = { id: 'cl1', name: 'กรมสรรพากร', kind: 'government' };
const bank: ClientResponse = { id: 'cl2', name: 'ธนาคารกสิกรไทย', kind: 'private' };

function experience(over: Partial<ExperienceResponse> = {}): ExperienceResponse {
  return {
    id: 'e1',
    client_id: revenue.id,
    project_name: 'ระบบยื่นภาษีออนไลน์',
    description: null,
    tech_stack: [],
    target_platforms: [],
    duration_value: null,
    duration_unit: null,
    duration_months: null,
    ...over,
  };
}

/** Puts the page in a known state: a company or none, plus these records. */
function givenPage(options: {
  company?: CompanyResponse | null;
  clients?: ClientResponse[];
  experiences?: ExperienceResponse[];
}) {
  mocked.fetchMyCompany.mockResolvedValue(options.company ?? null);
  mocked.fetchClients.mockResolvedValue({ clients: options.clients ?? [] });
  mocked.fetchExperiences.mockResolvedValue({ experiences: options.experiences ?? [] });
}

/**
 * Saving a company is a round trip: the create call answers with the record and
 * the next read of "my company" returns it. Stubbing only the first would let a
 * test pass against a page that never really learned it had a company.
 */
function whenCompanyCreated(company: CompanyResponse) {
  mocked.createCompany.mockImplementation(async () => {
    mocked.fetchMyCompany.mockResolvedValue(company);
    return company;
  });
}

const addButton = () => screen.getByRole('button', { name: 'เพิ่มผลงาน' });
const nameField = () => screen.getByLabelText('ชื่อบริษัท (ภาษาไทย)');
const saveCompany = () => screen.getByRole('button', { name: 'บันทึกบริษัท' });

/** Waits for the initial three fetches to land. */
async function settled() {
  await waitFor(() => expect(mocked.fetchMyCompany).toHaveBeenCalled());
  await screen.findByLabelText('ชื่อบริษัท (ภาษาไทย)');
}

beforeEach(() => {
  vi.clearAllMocks();
  mocked.fetchClientSuggestions.mockResolvedValue({ suggestions: [] });
  mocked.searchCompanies.mockResolvedValue({ companies: [] });
});

describe('the add-work button', () => {
  test('is unavailable, and says so, until the company is saved on the server', async () => {
    const user = userEvent.setup();
    givenPage({ company: null });

    render(<CompanyExperiences />);
    await settled();

    // Typing a name is not saving one, so the button must still refuse.
    await user.type(nameField(), TRUE_CORP);

    const button = addButton();
    expect(button).toHaveAttribute('aria-disabled', 'true');
    expect(button).toHaveAccessibleName('เพิ่มผลงาน');
    expect(button).toHaveAccessibleDescription('บันทึกบริษัทของคุณก่อน จึงจะเพิ่มผลงานได้');
    // Blocked cursor on hover — which is only possible because the button is
    // not truly `disabled` and still receives pointer events.
    expect(button).toHaveClass('cursor-not-allowed');
    // Still reachable by keyboard rather than skipped past.
    expect(button).not.toHaveAttribute('disabled');
    button.focus();
    expect(button).toHaveFocus();

    await user.click(button);
    expect(screen.queryByLabelText('ชื่อโครงการ')).not.toBeInTheDocument();
  });

  test('becomes available once the company has been saved', async () => {
    const user = userEvent.setup();
    givenPage({ company: null });
    whenCompanyCreated({ id: 'co1', name_th: TRUE_CORP, tin: null });

    render(<CompanyExperiences />);
    await settled();

    await user.type(nameField(), TRUE_CORP);
    await user.click(saveCompany());

    await waitFor(() => expect(addButton()).toHaveAttribute('aria-disabled', 'false'));

    await user.click(addButton());
    expect(await screen.findByLabelText('ชื่อโครงการ')).toBeInTheDocument();
  });

  test('is available from the start for an officer who already has a company', async () => {
    givenPage({ company: { id: 'co1', name_th: TRUE_CORP, tin: null } });

    render(<CompanyExperiences />);
    await settled();

    await waitFor(() => expect(addButton()).toHaveAttribute('aria-disabled', 'false'));
  });
});

describe('the step this page sits at', () => {
  const currentStep = () =>
    screen
      .getByRole('navigation', { name: 'ขั้นตอนการตั้งค่าบัญชี' })
      .querySelector('[aria-current="step"]')!;

  test('is the company step until one is saved, then the work step', async () => {
    const user = userEvent.setup();
    givenPage({ company: null });
    whenCompanyCreated({ id: 'co1', name_th: TRUE_CORP, tin: null });

    render(<CompanyExperiences />);
    await settled();

    expect(currentStep()).toHaveTextContent('บริษัท');
    // Nothing to finish into yet — the dashboard needs a company to be useful.
    expect(screen.queryByRole('link', { name: /ไปที่แดชบอร์ด/ })).not.toBeInTheDocument();

    await user.type(nameField(), TRUE_CORP);
    await user.click(saveCompany());

    await waitFor(() => expect(currentStep()).toHaveTextContent('ผลงาน'));
    expect(screen.getByRole('link', { name: /ไปที่แดชบอร์ด/ })).toHaveAttribute(
      'href',
      '/dashboard',
    );
  });

  test('is the work step immediately for an officer who already has a company', async () => {
    givenPage({ company: { id: 'co1', name_th: TRUE_CORP, tin: null } });

    render(<CompanyExperiences />);
    await settled();

    expect(currentStep()).toHaveTextContent('ผลงาน');
  });
});

describe('the company name', () => {
  test('accepts a real registered name with digits and brackets', async () => {
    const user = userEvent.setup();
    givenPage({ company: null });
    whenCompanyCreated({ id: 'co1', name_th: TRUE_CORP, tin: null });

    render(<CompanyExperiences />);
    await settled();

    await user.type(nameField(), TRUE_CORP);
    await user.click(saveCompany());

    await waitFor(() =>
      expect(mocked.createCompany).toHaveBeenCalledWith({ name_th: TRUE_CORP, tin: null }),
    );
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  test('rejects an English name typed into the Thai field', async () => {
    const user = userEvent.setup();
    givenPage({ company: null });

    render(<CompanyExperiences />);
    await settled();

    await user.type(nameField(), 'True Corporation');
    await user.click(saveCompany());

    expect(await screen.findByRole('alert')).toHaveTextContent('ชื่อบริษัทต้องเป็นภาษาไทย');
    expect(mocked.createCompany).not.toHaveBeenCalled();
  });

  test('hints at a missing legal form without refusing to save', async () => {
    const user = userEvent.setup();
    givenPage({ company: null });
    whenCompanyCreated({ id: 'co1', name_th: 'ทรู คอร์ปอเรชั่น', tin: null });

    render(<CompanyExperiences />);
    await settled();

    await user.type(nameField(), 'ทรู คอร์ปอเรชั่น');

    expect(await screen.findByRole('status')).toHaveTextContent('ไม่พบคำระบุรูปแบบนิติบุคคล');
    // A hint is never a rejection.
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    await user.click(saveCompany());

    await waitFor(() =>
      expect(mocked.createCompany).toHaveBeenCalledWith({
        name_th: 'ทรู คอร์ปอเรชั่น',
        tin: null,
      }),
    );
  });

  test('shows no hint for a name that carries a legal form', async () => {
    const user = userEvent.setup();
    givenPage({ company: null });

    render(<CompanyExperiences />);
    await settled();

    await user.type(nameField(), TRUE_CORP);

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});

describe('the list of past work', () => {
  test('groups work under the client it was delivered for', async () => {
    givenPage({
      company: { id: 'co1', name_th: TRUE_CORP, tin: null },
      clients: [revenue, bank],
      experiences: [
        experience({ id: 'e1', client_id: revenue.id, project_name: 'ระบบยื่นภาษีออนไลน์' }),
        experience({ id: 'e2', client_id: revenue.id, project_name: 'ระบบคืนภาษี' }),
        experience({ id: 'e3', client_id: bank.id, project_name: 'แอปพลิเคชันโมบายแบงก์กิ้ง' }),
      ],
    });

    render(<CompanyExperiences />);
    await settled();

    const governmentGroup = (await screen.findByRole('heading', { name: revenue.name })).closest(
      'section',
    ) as HTMLElement;
    const privateGroup = screen
      .getByRole('heading', { name: bank.name })
      .closest('section') as HTMLElement;

    // Each group carries its own work and only its own.
    expect(within(governmentGroup).getByText('ระบบยื่นภาษีออนไลน์')).toBeInTheDocument();
    expect(within(governmentGroup).getByText('ระบบคืนภาษี')).toBeInTheDocument();
    expect(
      within(governmentGroup).queryByText('แอปพลิเคชันโมบายแบงก์กิ้ง'),
    ).not.toBeInTheDocument();
    expect(within(privateGroup).getByText('แอปพลิเคชันโมบายแบงก์กิ้ง')).toBeInTheDocument();

    // Government or private is answered once per client, at the heading.
    expect(within(governmentGroup).getByText('หน่วยงานรัฐ')).toBeInTheDocument();
    expect(within(privateGroup).getByText('เอกชน')).toBeInTheDocument();
  });

  test('shows two years back as two years, not twenty four months', async () => {
    givenPage({
      company: { id: 'co1', name_th: TRUE_CORP, tin: null },
      clients: [revenue],
      experiences: [experience({ duration_value: 2, duration_unit: 'years', duration_months: 24 })],
    });

    render(<CompanyExperiences />);
    await settled();

    expect(await screen.findByText('ระยะเวลา 2 ปี')).toBeInTheDocument();
    expect(screen.queryByText(/24 เดือน/)).not.toBeInTheDocument();
  });

  test('shows a length entered in months in months', async () => {
    givenPage({
      company: { id: 'co1', name_th: TRUE_CORP, tin: null },
      clients: [revenue],
      experiences: [experience({ duration_value: 6, duration_unit: 'months', duration_months: 6 })],
    });

    render(<CompanyExperiences />);
    await settled();

    expect(await screen.findByText('ระยะเวลา 6 เดือน')).toBeInTheDocument();
  });
});

describe('recording a piece of work', () => {
  test('saves with only a client and a project name', async () => {
    const user = userEvent.setup();
    givenPage({
      company: { id: 'co1', name_th: TRUE_CORP, tin: null },
      clients: [revenue],
    });
    mocked.createExperience.mockResolvedValue(experience({ id: 'new' }));

    render(<CompanyExperiences />);
    await settled();

    await waitFor(() => expect(addButton()).toHaveAttribute('aria-disabled', 'false'));
    await user.click(addButton());

    await user.type(await screen.findByLabelText('ชื่อโครงการ'), 'ระบบสารบรรณอิเล็กทรอนิกส์');
    await user.click(screen.getByRole('button', { name: 'บันทึกผลงาน' }));

    await waitFor(() =>
      expect(mocked.createExperience).toHaveBeenCalledWith(
        expect.objectContaining({
          client_id: revenue.id,
          project_name: 'ระบบสารบรรณอิเล็กทรอนิกส์',
          description: null,
          tech_stack: [],
          target_platforms: [],
          duration_value: null,
          duration_unit: null,
        }),
      ),
    );
  });

  test('records platforms, tech and a length in years as typed', async () => {
    const user = userEvent.setup();
    givenPage({
      company: { id: 'co1', name_th: TRUE_CORP, tin: null },
      clients: [revenue],
    });
    mocked.createExperience.mockResolvedValue(experience({ id: 'new' }));

    render(<CompanyExperiences />);
    await settled();

    await waitFor(() => expect(addButton()).toHaveAttribute('aria-disabled', 'false'));
    await user.click(addButton());

    await user.type(await screen.findByLabelText('ชื่อโครงการ'), 'ระบบติดตามงาน');
    await user.type(screen.getByLabelText('เทคโนโลยีที่ใช้ (ไม่บังคับ)'), 'React, Node.js');
    await user.click(screen.getByRole('button', { name: 'เว็บแอปพลิเคชัน' }));
    await user.type(screen.getByLabelText('ระยะเวลา (ไม่บังคับ)'), '2');
    await user.selectOptions(screen.getByLabelText('หน่วยของระยะเวลา'), 'years');

    await user.click(screen.getByRole('button', { name: 'บันทึกผลงาน' }));

    await waitFor(() =>
      expect(mocked.createExperience).toHaveBeenCalledWith(
        expect.objectContaining({
          tech_stack: ['React', 'Node.js'],
          target_platforms: ['web_app'],
          duration_value: 2,
          duration_unit: 'years',
        }),
      ),
    );
  });

  test('will not save without a project name', async () => {
    const user = userEvent.setup();
    givenPage({
      company: { id: 'co1', name_th: TRUE_CORP, tin: null },
      clients: [revenue],
    });

    render(<CompanyExperiences />);
    await settled();

    await waitFor(() => expect(addButton()).toHaveAttribute('aria-disabled', 'false'));
    await user.click(addButton());

    await user.click(await screen.findByRole('button', { name: 'บันทึกผลงาน' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('กรุณากรอกชื่อโครงการ');
    expect(mocked.createExperience).not.toHaveBeenCalled();
  });

  test('removes a piece of work the officer entered wrongly', async () => {
    const user = userEvent.setup();
    givenPage({
      company: { id: 'co1', name_th: TRUE_CORP, tin: null },
      clients: [revenue],
      experiences: [experience()],
    });
    mocked.deleteExperience.mockResolvedValue(undefined);

    render(<CompanyExperiences />);
    await settled();

    await user.click(await screen.findByRole('button', { name: 'ลบ' }));

    await waitFor(() => expect(mocked.deleteExperience).toHaveBeenCalledWith('e1'));
  });
});

describe('finding a company a colleague already made', () => {
  test('joins the match rather than starting a second record', async () => {
    const user = userEvent.setup();
    givenPage({ company: null });
    mocked.searchCompanies.mockResolvedValue({
      companies: [{ id: 'co9', name_th: TRUE_CORP, tin: '1234567890123' }],
    });
    mocked.joinCompany.mockImplementation(async () => {
      const joined = { id: 'co9', name_th: TRUE_CORP, tin: '1234567890123' };
      mocked.fetchMyCompany.mockResolvedValue(joined);
      return joined;
    });

    render(<CompanyExperiences />);
    await settled();

    await user.click(screen.getByRole('button', { name: /ค้นหาบริษัทที่มีอยู่แล้ว/ }));
    await user.type(await screen.findByPlaceholderText('พิมพ์ชื่อบริษัทเป็นภาษาไทย'), 'ทรู');

    await user.click(await screen.findByText(TRUE_CORP));

    await waitFor(() => expect(mocked.joinCompany).toHaveBeenCalledWith('co9'));
    // Joining is what makes work recordable, so the gate opens.
    await waitFor(() => expect(addButton()).toHaveAttribute('aria-disabled', 'false'));
  });

  test('offers to create the company when nothing matches', async () => {
    const user = userEvent.setup();
    givenPage({ company: null });
    mocked.searchCompanies.mockResolvedValue({ companies: [] });

    render(<CompanyExperiences />);
    await settled();

    await user.click(screen.getByRole('button', { name: /ค้นหาบริษัทที่มีอยู่แล้ว/ }));
    await user.type(await screen.findByPlaceholderText('พิมพ์ชื่อบริษัทเป็นภาษาไทย'), TRUE_CORP);

    // Being first must not be a dead end: what was searched for is carried
    // straight into the name field, ready to save.
    await user.click(await screen.findByText(`สร้างบริษัทใหม่ “${TRUE_CORP}”`));

    await waitFor(() => expect(nameField()).toHaveValue(TRUE_CORP));
  });
});
