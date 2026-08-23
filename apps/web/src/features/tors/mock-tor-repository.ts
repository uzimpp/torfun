import type { TorWithMatch, TorRepository, TorSearchFilters } from './types';

const now = new Date('2027-10-28T09:00:00+07:00');

const match = (torId: string, overallScore: number) => ({
  torId,
  overallScore,
  breakdown: {
    techStackScore: Math.min(overallScore + 0.05, 1),
    deadlineScore: 0.78,
    industryScore: Math.min(overallScore + 0.02, 1),
    targetPlatformScore: 0.9,
    decisionRulesScore: 0.82,
  },
  computedAt: now,
});

type Seed = Pick<
  TorWithMatch,
  | 'id'
  | 'title'
  | 'summary'
  | 'agency'
  | 'budgetThb'
  | 'publishedAt'
  | 'deadlineAt'
  | 'techStack'
  | 'industry'
  | 'targetPlatforms'
  | 'status'
  | 'isFavorite'
> & { score: number };

const seeds: Seed[] = [
  {
    id: 'bma-hospital-data-2027',
    title: 'ระบบบริหารจัดการข้อมูลโรงพยาบาล',
    summary: 'พัฒนาระบบข้อมูลผู้ป่วย การนัดหมาย และรายงานสำหรับโรงพยาบาลในสังกัดกรุงเทพมหานคร',
    agency: 'กรุงเทพมหานคร',
    budgetThb: 5_000_000,
    publishedAt: new Date('2027-09-27T09:00:00+07:00'),
    deadlineAt: new Date('2027-12-05T16:30:00+07:00'),
    techStack: ['Node.js', 'React', 'PostgreSQL'],
    industry: 'สาธารณสุข',
    targetPlatforms: ['web_app'],
    status: 'published',
    score: 0.87,
    isFavorite: true,
  },
  {
    id: 'bma-citizen-services-2027',
    title: 'ปรับปรุงระบบบริการประชาชนออนไลน์',
    summary: 'ยกระดับเว็บไซต์และระบบยื่นคำร้องสำหรับบริการของกรุงเทพมหานคร',
    agency: 'กรุงเทพมหานคร',
    budgetThb: 3_850_000,
    publishedAt: new Date('2027-09-24T09:00:00+07:00'),
    deadlineAt: new Date('2027-12-12T16:30:00+07:00'),
    techStack: ['React', 'TypeScript', 'Node.js'],
    industry: 'ภาครัฐ',
    targetPlatforms: ['web_app', 'mobile'],
    status: 'published',
    score: 0.84,
  },
  {
    id: 'pwa-billing-2027',
    title: 'ระบบรับชำระค่าน้ำประปาและแจ้งเตือนลูกค้า',
    summary: 'พัฒนาระบบรับชำระเงินและแจ้งเตือนหลายช่องทางสำหรับผู้ใช้น้ำประปา',
    agency: 'การประปานครหลวง',
    budgetThb: 7_200_000,
    publishedAt: new Date('2027-09-20T09:00:00+07:00'),
    deadlineAt: new Date('2027-12-18T16:30:00+07:00'),
    techStack: ['Node.js', 'React', 'Mobile'],
    industry: 'สาธารณูปโภค',
    targetPlatforms: ['web_app', 'mobile'],
    status: 'published',
    score: 0.81,
    isFavorite: true,
  },
  {
    id: 'dga-document-2027',
    title: 'ระบบจัดการเอกสารอิเล็กทรอนิกส์ส่วนกลาง',
    summary: 'จัดทำระบบจัดเก็บ ค้นหา และติดตามเอกสารสำหรับหน่วยงานภาครัฐ',
    agency: 'สำนักงานพัฒนารัฐบาลดิจิทัล',
    budgetThb: 9_600_000,
    publishedAt: new Date('2027-09-17T09:00:00+07:00'),
    deadlineAt: new Date('2027-12-20T16:30:00+07:00'),
    techStack: ['Python', 'React', 'Docker'],
    industry: 'ภาครัฐ',
    targetPlatforms: ['web_app'],
    status: 'draft',
    score: 0.76,
  },
  {
    id: 'thai-red-cross-appointment-2027',
    title: 'ระบบนัดหมายและติดตามผลบริการทางการแพทย์',
    summary: 'พัฒนาระบบนัดหมายผู้รับบริการและแดชบอร์ดติดตามผลการให้บริการ',
    agency: 'สภากาชาดไทย',
    budgetThb: 2_750_000,
    publishedAt: new Date('2027-09-14T09:00:00+07:00'),
    deadlineAt: new Date('2027-12-24T16:30:00+07:00'),
    techStack: ['React', 'Node.js'],
    industry: 'สาธารณสุข',
    targetPlatforms: ['web_app'],
    status: 'published',
    score: 0.72,
  },
];

export const mockTors: TorWithMatch[] = seeds.map(({ score, ...tor }) => ({
  ...tor,
  province: 'bangkok',
  source: {
    websiteName: `ระบบจัดซื้อจัดจ้าง${tor.agency}`,
    sourceUrl: `https://example.org/tors/${tor.id}`,
  },
  contentHash: tor.id,
  createdAt: now,
  updatedAt: now,
  match: match(tor.id, score),
}));

function includes(value: string | undefined, query: string | undefined) {
  return !query || value?.toLocaleLowerCase('th-TH').includes(query.toLocaleLowerCase('th-TH'));
}

export const mockTorRepository: TorRepository = {
  async getRecommended(limit = 6) {
    return [...mockTors]
      .sort((a, b) => (b.match?.overallScore ?? 0) - (a.match?.overallScore ?? 0))
      .slice(0, limit);
  },
  async getLatest(limit = 3) {
    return [...mockTors]
      .sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime())
      .slice(0, limit);
  },
  async getFavorites() {
    return mockTors.filter((tor) => tor.isFavorite);
  },
  async getById(id) {
    return mockTors.find((tor) => tor.id === id) ?? null;
  },
  async search(filters: TorSearchFilters = {}) {
    const items = mockTors
      .filter(
        (tor) =>
          includes(`${tor.title} ${tor.agency}`, filters.query) &&
          includes(tor.agency, filters.agency) &&
          (!filters.technology ||
            tor.techStack.some((technology) => includes(technology, filters.technology))) &&
          (!filters.minBudget || (tor.budgetThb ?? 0) >= filters.minBudget) &&
          (!filters.minMatchScore || (tor.match?.overallScore ?? 0) * 100 >= filters.minMatchScore),
      )
      .sort((a, b) =>
        filters.sort === 'published'
          ? b.publishedAt.getTime() - a.publishedAt.getTime()
          : filters.sort === 'match'
            ? (b.match?.overallScore ?? 0) - (a.match?.overallScore ?? 0)
            : a.deadlineAt.getTime() - b.deadlineAt.getTime(),
      );
    return { items, total: items.length, page: 1, pageSize: 12 };
  },
};
