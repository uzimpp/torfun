import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import {
  EMPTY_TIMELINE,
  ACCESS_COOKIE,
  toCompanyQualificationsPayload,
  fromCompanyQualificationsPayload,
  type CompanyQualificationsRecord,
  type Procurement,
  type TorAnalysis,
  type User,
} from '@torfun/types';
import { buildApp } from '../app';
import { testEnv } from '../testing/env';
import { InMemoryCompanyStore } from '../testing/company-store';
import { InMemoryExperienceStore } from '../testing/experience-store';
import { InMemoryUserStore } from '../testing/user-store';
import { InMemoryProcurementStore } from '../testing/procurement-store';

function procurement(overrides: Partial<Procurement> = {}): Procurement {
  return {
    projectId: 'project-1',
    projectName: 'โครงการพัฒนาระบบสารสนเทศ',
    deptName: 'หน่วยงานรัฐ',
    deptSubName: null,
    deptCode: '1234567890',
    budgetYear: 2569,
    typeId: null,
    goodsId: null,
    detailReadAt: '2026-09-01T00:00:00.000Z',
    announceDate: '1 ตุลาคม 2569',
    purchaseMethodName: 'e-bidding',
    projectMoney: 4_500_000,
    priceBuild: null,
    state: 'Completed',
    outcome: 'tor_analysed',
    attempts: 0,
    holdReason: null,
    statusHistory: [],
    analysis: null,
    discoveredAt: '2026-09-16T00:00:00.000Z',
    timeline: { ...EMPTY_TIMELINE, status: 'open' },
    approved: null,
    archive: { zipId: 'zip-1', documents: [], torAmbiguous: false },
    updatedAt: '2026-09-16T00:00:00.000Z',
    ...overrides,
  };
}

describe('TOR detail routes', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let procurements: InMemoryProcurementStore;
  let users: InMemoryUserStore;
  let companies: InMemoryCompanyStore;

  beforeEach(async () => {
    procurements = new InMemoryProcurementStore();
    users = new InMemoryUserStore();
    companies = new InMemoryCompanyStore();
    await procurements.upsert(procurement());
    app = await buildApp(testEnv({ LOG_LEVEL: 'fatal' }), {
      procurements,
      users,
      companies,
      experiences: new InMemoryExperienceStore(),
    });
  });

  afterEach(async () => {
    await app.close();
  });

  const session = (role: User['role'] = 'business_development_officer') => ({
    [ACCESS_COOKIE]: app.jwt.sign({
      user_id: 'user-1',
      username: 'tester',
      role,
    }),
  });

  test('qualification results and ranking use only the signed-in company evidence', async () => {
    const company = await companies.create({ nameTh: 'บริษัท ตัวอย่าง จำกัด', tin: null });
    const other = await companies.create({ nameTh: 'บริษัท ทดสอบ จำกัด', tin: null });
    const member = users.seed({ companyId: company.id });
    const outsider = users.seed({ companyId: other.id });
    const cookiesFor = (user: User) => ({
      [ACCESS_COOKIE]: app.jwt.sign({ user_id: user.id, username: user.username, role: user.role }),
    });
    const profile = {
      companyId: company.id,
      revision: null,
      registeredCapitalThb: 100_000,
      certificates: [
        { name: 'Security', standard: 'ISO 27001', issuer: 'Test', validUntil: '2099-12-31' },
      ],
      personnel: [
        { role: 'Developer', yearsOfExperience: 5, degree: 'BSc', certificates: ['PMP'] },
      ],
    };
    const url = '/api/companies/me/qualifications';
    const save = (user: User, payload: CompanyQualificationsRecord) =>
      app.inject({
        method: 'POST',
        url,
        cookies: cookiesFor(user),
        payload: toCompanyQualificationsPayload(payload),
        headers: { 'content-type': 'application/json' },
      });
    expect((await app.inject({ url })).statusCode).toBe(401);
    expect((await save(outsider, profile)).statusCode).toBe(404);
    expect(
      (
        await save(member, {
          ...profile,
          personnel: [{ ...profile.personnel[0]!, certificates: ['ISO/IEC 27001'] }],
        })
      ).statusCode,
    ).toBe(400);
    const saved = await save(member, profile);
    expect(saved.statusCode).toBe(200);
    expect(saved.json().revision).toBeString();
    expect((await save(member, profile)).statusCode).toBe(409);
    const outsideProfile = await app.inject({ url, cookies: cookiesFor(outsider) });
    expect(outsideProfile.json()).toMatchObject({
      company_id: other.id,
      certificates: [],
      personnel: [],
    });

    const analysis: TorAnalysis = {
      summary: 'ระบบสารสนเทศ',
      scopeOfWork: [],
      budgetThb: null,
      deadlineAt: null,
      durationDays: null,
      techStack: [],
      targetPlatforms: [],
      requiredQualifications: [],
      qualifications: [
        {
          kind: 'company_certificate',
          manualReviewReason: null,
          standard: 'ISO/IEC 27001',
          issuer: null,
          source: 'ข้อ 4.2',
          text: 'ต้องมี ISO/IEC 27001',
        },
        {
          kind: 'personnel',
          manualReviewReason: null,
          role: 'Developer',
          degree: 'BSc',
          headcount: 2,
          minYears: 3,
          certificates: ['PMP'],
          source: 'หน้า 12',
          text: 'ต้องมีนักพัฒนา 2 คน',
        },
        {
          kind: 'personnel',
          role: 'Developer',
          degree: 'BSc',
          headcount: 1,
          minYears: 3,
          certificates: ['PMP'],
          source: 'หน้า 13',
          text: 'ต้องมีนักพัฒนา 1 คน ที่มีผลงานอย่างน้อย ๒ โครงการ',
          manualReviewReason: 'ต้องตรวจจำนวนโครงการของบุคลากร',
        },
        { kind: 'manual', source: 'ข้อ 4.9', text: 'ตรวจเงื่อนไขทางกฎหมาย' },
      ],
    };
    await procurements.upsert(procurement({ projectId: 'qualified', analysis }));
    await procurements.upsert(
      procurement({
        projectId: 'other-qualified',
        analysis: {
          ...analysis,
          qualifications: analysis.qualifications?.filter((clause) => clause.source !== 'หน้า 13'),
        },
      }),
    );
    const detailUrl = '/api/tors/qualified';
    const detail = await app.inject({ url: detailUrl, cookies: cookiesFor(member) });
    expect(detail.statusCode).toBe(200);
    expect(detail.headers['cache-control']).toBe('private, no-store');
    expect(detail.json().analysis.qualifications[0].source).toBe('ข้อ 4.2');
    expect(detail.json().matchResult).toMatchObject({
      companyId: company.id,
      overallScore: 1 / 4,
      checks: [
        { status: 'met', evidence: [expect.stringContaining('Security')] },
        {
          status: 'not_met',
          evidence: expect.arrayContaining([expect.stringContaining('Developer')]),
        },
        { status: 'unknown', evidence: expect.arrayContaining(['ต้องตรวจจำนวนโครงการของบุคลากร']) },
        { status: 'unknown' },
      ],
    });
    const outsideDetail = await app.inject({ url: detailUrl, cookies: cookiesFor(outsider) });
    expect(outsideDetail.json().matchResult).toMatchObject({
      companyId: other.id,
      overallScore: null,
      checks: Array.from({ length: 4 }, () => ({ status: 'unknown' })),
    });
    expect(outsideDetail.body).not.toContain('Security');

    const list = await app.inject({ url: '/api/tors?limit=3', cookies: cookiesFor(member) });
    expect(list.json()).toMatchObject({
      items: [
        { projectId: 'other-qualified', matchScore: 1 / 3 },
        { projectId: 'qualified', matchScore: 1 / 4 },
        { projectId: 'project-1', matchScore: null },
      ],
      total: 3,
    });
    expect(list.json().items[1].matchResult).toBeUndefined();

    await users.setCompanyId(member.id, other.id);
    expect((await save(member, fromCompanyQualificationsPayload(saved.json()))).statusCode).toBe(
      404,
    );
  });

  test('rejects an anonymous caller', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/tors/project-1' });
    expect(response.statusCode).toBe(401);
  });

  test('rejects an anonymous caller from the procurement index', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/tors' });
    expect(response.statusCode).toBe(401);
  });

  test('returns an existing procurement to an authenticated officer', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/tors/project-1',
      cookies: session(),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      projectId: 'project-1',
      projectName: 'โครงการพัฒนาระบบสารสนเทศ',
      analysis: null,
    });
  });

  test('lists and filters procurements for an authenticated officer', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/tors?limit=20&minBudget=500000',
      cookies: session(),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      items: [{ projectId: 'project-1' }],
      total: 1,
      limit: 20,
      offset: 0,
    });
  });

  test.each([
    '/api/tors?minBudget=20&maxBudget=10',
    '/api/tors?publishedFrom=2026-02-30',
    '/api/tors?deadlineFrom=2026-10-02&deadlineTo=2026-10-01',
    '/api/tors?targetPlatforms=television',
    '/api/tors?minDaysLeft=-1',
    '/api/tors?minDaysLeft=3.5',
    '/api/tors?minDaysLeft=366',
    '/api/tors?minDaysLeft=3&deadlineFrom=2026-10-01',
  ])('rejects an invalid officer filter query: %s', async (url) => {
    const response = await app.inject({ method: 'GET', url, cookies: session() });

    expect(response.statusCode).toBe(400);
  });

  test('returns an existing procurement to an administrator', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/tors/project-1',
      cookies: session('admin'),
    });

    expect(response.statusCode).toBe(200);
  });

  test('returns 404 for an unknown project', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/tors/missing',
      cookies: session(),
    });

    expect(response.statusCode).toBe(404);
  });
});
