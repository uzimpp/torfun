import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { SimilarAwardListed, SimilarAwards } from '@torfun/types';

import { TorSimilarAwards } from './tor-similar-awards';

vi.mock('@/lib/api', () => ({ fetchTorSimilarAwards: vi.fn() }));

const api = await import('@/lib/api');
const mocked = vi.mocked(api);

// Fixtures only: invented projects and companies.
const listed = (overrides: Partial<SimilarAwardListed> = {}): SimilarAwardListed => ({
  projectId: 'earlier-1',
  projectName: 'ประกวดราคาจ้างบำรุงรักษาระบบตัวอย่าง',
  deptName: 'หน่วยงานตัวอย่าง',
  budget: 1_000_000,
  announceDate: '2025-10-01T00:00:00.000Z',
  difference: 50_000,
  contractYears: [2569],
  winnerStatus: 'resolved',
  winners: [{ name: 'บริษัท เอ จำกัด', jointVenture: false }],
  undeterminedAwards: 0,
  bidderCount: 2,
  bidderCountGap: null,
  clean: true,
  prices: {
    agreedPrice: 950_000,
    agreedPriceUnusable: false,
    agreedToBudget: 0.95,
    exceedsBudget: false,
    averageBid: 960_000,
    pricedBids: 2,
  },
  bidders: 'read',
  ...overrides,
});

const competition = (overrides: Partial<NonNullable<SimilarAwards['competition']>> = {}) => ({
  thresholds: { fewMax: 3, provisional: true as const },
  minSample: 5,
  minSampleProvisional: true as const,
  duplicatesIgnored: 0,
  comparables: 1,
  withContractData: 1,
  withResolvedWinner: 1,
  withKnownBidderCount: 1,
  clean: 1,
  unknownBidderCounts: {
    no_bids: 0,
    unnamed_bidder: 0,
    several_years: 0,
    year_without_contract: 0,
  },
  level: null,
  bidders: null,
  ...overrides,
});

const result = (overrides: Partial<SimilarAwards> = {}): SimilarAwards => ({
  status: 'ok',
  keyword: 'บำรุงรักษาระบบตัวอย่าง',
  keywordSkipped: null,
  cooldownUntil: null,
  ownBudget: 1_000_000,
  searches: [
    { year: 2568, total: 0, read: 0, truncated: false, outcome: 'read' },
    { year: 2569, total: 1, read: 1, truncated: false, outcome: 'read' },
    { year: 2570, total: 0, read: 0, truncated: false, outcome: 'read' },
  ],
  rowsRead: 1,
  excluded: {
    ownProject: 0,
    otherAgency: 0,
    notEBidding: 0,
    noContractLines: 0,
    torUndated: 0,
    undated: 0,
    notEarlier: 0,
    malformed: 0,
    duplicates: 0,
  },
  projects: 1,
  closestCount: 1,
  withoutBudget: 0,
  listed: [listed()],
  bidderCalls: { used: 1, max: 10 },
  competition: competition(),
  complete: true,
  cached: false,
  fetchedAt: '2026-11-22T03:00:00.000Z',
  ...overrides,
});

beforeEach(() => vi.clearAllMocks());

const search = async () => {
  await userEvent.click(screen.getByRole('button', { name: 'ค้นหาโครงการคล้ายกัน' }));
};

/** The value shown under a label in one listed project. */
const fact = (item: HTMLElement, label: string) =>
  within(item).getByText(label).nextElementSibling as HTMLElement;

const renderResult = async (value: SimilarAwards) => {
  mocked.fetchTorSimilarAwards.mockResolvedValue(value);
  const view = render(<TorSimilarAwards projectId="tor-1" />);
  await search();
  await screen.findByRole('button', { name: 'ค้นหาอีกครั้ง' });
  return view;
};

describe('TorSimilarAwards: asking', () => {
  test('asks nothing until the button is pressed', () => {
    render(<TorSimilarAwards projectId="tor-1" />);

    expect(mocked.fetchTorSimilarAwards).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'ค้นหาโครงการคล้ายกัน' })).toBeEnabled();
  });

  test('says in one short note that a result is found by name, unconfirmed and unverified', () => {
    render(<TorSimilarAwards projectId="tor-1" />);

    expect(screen.getByText(/พบจากชื่อที่คล้ายกัน/)).toHaveTextContent(
      'ไม่ยืนยันว่าเป็นงานเดียวกันหรือเป็นซอฟต์แวร์ และระบบไม่ได้ตรวจสอบข้อมูล',
    );
    expect(screen.getByText('ทดลอง')).toBeInTheDocument();
    // The cost of a search is a hint on the button, not a paragraph on the page.
    expect(screen.getByRole('button', { name: 'ค้นหาโครงการคล้ายกัน' })).toHaveAttribute(
      'title',
      expect.stringContaining('โควตา'),
    );
    expect(screen.queryByText(/โควตา/)).not.toBeInTheDocument();
  });

  test('one press makes one call for this project, and shows that it is working', async () => {
    let finish!: (value: SimilarAwards) => void;
    mocked.fetchTorSimilarAwards.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    render(<TorSimilarAwards projectId="tor-1" />);

    await search();

    expect(mocked.fetchTorSimilarAwards).toHaveBeenCalledTimes(1);
    expect(mocked.fetchTorSimilarAwards).toHaveBeenCalledWith('tor-1');
    expect(screen.getByRole('status')).toHaveTextContent('กำลังค้นหา');
    const busy = screen.getByRole('button', { name: 'กำลังค้นหา...' });
    expect(busy).toBeDisabled();
    await userEvent.click(busy);
    expect(mocked.fetchTorSimilarAwards).toHaveBeenCalledTimes(1);

    finish(result());
    expect(await screen.findByRole('button', { name: 'ค้นหาอีกครั้ง' })).toBeEnabled();
  });

  test('a failed search says so in one line and can be tried again', async () => {
    mocked.fetchTorSimilarAwards.mockRejectedValueOnce(new Error('x'));
    render(<TorSimilarAwards projectId="tor-1" />);

    await search();

    expect(await screen.findByRole('alert')).toHaveTextContent('ค้นหาไม่สำเร็จ ลองใหม่อีกครั้ง');
    mocked.fetchTorSimilarAwards.mockResolvedValueOnce(result());
    await search();
    await screen.findByText(/ผู้ได้รับสัญญา:/);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  test('an answer for another project is never shown on this one', async () => {
    let finish!: (value: SimilarAwards) => void;
    mocked.fetchTorSimilarAwards.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    const { rerender } = render(<TorSimilarAwards projectId="tor-1" />);
    await search();

    rerender(<TorSimilarAwards projectId="tor-2" />);
    finish(result());

    await waitFor(() => expect(screen.queryByText(/ผู้ได้รับสัญญา:/)).not.toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'ค้นหาโครงการคล้ายกัน' })).toBeEnabled();
  });
});

describe('TorSimilarAwards: what the reader came for', () => {
  test('a past award shows the name, agency, year, budget, agreed price, bidders and winner', async () => {
    await renderResult(result());

    const item = screen.getByText('ประกวดราคาจ้างบำรุงรักษาระบบตัวอย่าง').closest('li')!;
    expect(within(item).getByText(/หน่วยงานตัวอย่าง/)).toHaveTextContent('สัญญาปีงบประมาณ 2569');
    expect(fact(item, 'งบประมาณที่ตั้งไว้')).toHaveTextContent('1,000,000 บาท');
    expect(fact(item, 'ราคาตามสัญญา')).toHaveTextContent('950,000 บาท (95% ของงบ)');
    expect(fact(item, 'ผู้เสนอราคา')).toHaveTextContent('2 ราย');
    expect(within(item).getByText('ผู้ได้รับสัญญา: บริษัท เอ จำกัด')).toBeInTheDocument();
  });

  test('the price is the agreed contract price, and no text calls it a winning price', async () => {
    const { container } = await renderResult(result());

    expect(screen.getByText('ราคาตามสัญญา')).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/ราคาที่ชนะ|winning/i);
  });

  test('an agreed price above the budget is shown as it is, with one short note', async () => {
    await renderResult(
      result({
        listed: [
          listed({
            prices: {
              agreedPrice: 1_200_000,
              agreedPriceUnusable: false,
              agreedToBudget: 1.2,
              exceedsBudget: true,
              averageBid: null,
              pricedBids: 0,
            },
          }),
        ],
      }),
    );

    const item = screen.getByText('ประกวดราคาจ้างบำรุงรักษาระบบตัวอย่าง').closest('li')!;
    expect(fact(item, 'ราคาตามสัญญา')).toHaveTextContent('1,200,000 บาท (120% ของงบ)');
    expect(
      within(item).getByText(/ราคาตามสัญญาสูงกว่างบที่ตั้งไว้ แสดงตามที่เผยแพร่/),
    ).toBeInTheDocument();
  });

  test('an unusable agreed price is shown as published and never turned into a ratio', async () => {
    await renderResult(
      result({
        listed: [
          listed({
            prices: {
              agreedPrice: 0,
              agreedPriceUnusable: true,
              agreedToBudget: null,
              exceedsBudget: false,
              averageBid: null,
              pricedBids: 0,
            },
          }),
        ],
      }),
    );

    const item = screen.getByText('ประกวดราคาจ้างบำรุงรักษาระบบตัวอย่าง').closest('li')!;
    expect(fact(item, 'ราคาตามสัญญา')).toHaveTextContent('0 บาท (ใช้เทียบไม่ได้)');
    expect(fact(item, 'ราคาตามสัญญา').textContent).not.toContain('%');
  });

  test('a project that is not clean shows no price, in one word', async () => {
    await renderResult(result({ listed: [listed({ clean: false, prices: null })] }));

    const item = screen.getByText('ประกวดราคาจ้างบำรุงรักษาระบบตัวอย่าง').closest('li')!;
    expect(fact(item, 'ราคาตามสัญญา')).toHaveTextContent('ไม่แสดง');
  });

  test('says why the price is hidden: the bidder count is not known', async () => {
    await renderResult(
      result({
        listed: [
          listed({
            clean: false,
            prices: null,
            bidders: 'none',
            bidderCount: null,
            bidderCountGap: 'no_bids',
          }),
        ],
      }),
    );

    const item = screen.getByText('ประกวดราคาจ้างบำรุงรักษาระบบตัวอย่าง').closest('li')!;
    expect(fact(item, 'ราคาตามสัญญา')).toHaveTextContent('ไม่แสดง (ยังไม่ทราบจำนวนผู้เสนอราคา)');
    // The winner is still named: only the price is held back.
    expect(within(item).getByText(/ผู้ได้รับสัญญา: บริษัท เอ จำกัด/)).toBeInTheDocument();
  });

  test('says why the price is hidden when the count is known: the contract is not a single one', async () => {
    await renderResult(
      result({
        listed: [listed({ clean: false, prices: null, bidderCount: 3, bidders: 'read' })],
      }),
    );

    const item = screen.getByText('ประกวดราคาจ้างบำรุงรักษาระบบตัวอย่าง').closest('li')!;
    expect(fact(item, 'ราคาตามสัญญา')).toHaveTextContent(
      'ไม่แสดง (สัญญาไม่ใช่แบบเดียว รายการเดียว)',
    );
    expect(fact(item, 'ราคาตามสัญญา')).not.toHaveTextContent('ยังไม่ทราบจำนวนผู้เสนอราคา');
  });

  test('every amount is kept whole, so "บาท" never starts a new line', async () => {
    await renderResult(result());

    const item = screen.getByText('ประกวดราคาจ้างบำรุงรักษาระบบตัวอย่าง').closest('li')!;
    for (const amount of ['1,000,000 บาท', '950,000 บาท']) {
      expect(within(item).getByText(amount)).toHaveClass('whitespace-nowrap');
    }
  });

  test('each figure sits at the top of its cell, so a taller neighbour does not push it down', async () => {
    await renderResult(
      result({
        listed: [listed({ clean: false, prices: null, bidderCount: null, bidders: 'none' })],
      }),
    );

    const item = screen.getByText('ประกวดราคาจ้างบำรุงรักษาระบบตัวอย่าง').closest('li')!;
    for (const label of ['งบประมาณที่ตั้งไว้', 'ราคาตามสัญญา', 'ผู้เสนอราคา']) {
      expect(within(item).getByText(label).parentElement).toHaveClass('content-start');
    }
  });

  test('an agreed price shown as unusable is kept whole too', async () => {
    await renderResult(
      result({
        listed: [
          listed({
            prices: {
              agreedPrice: 0,
              agreedPriceUnusable: true,
              agreedToBudget: null,
              exceedsBudget: false,
              averageBid: null,
              pricedBids: 0,
            },
          }),
        ],
      }),
    );

    expect(screen.getByText('0 บาท')).toHaveClass('whitespace-nowrap');
  });

  test('a winner that is not determined is said so, never named', async () => {
    await renderResult(
      result({
        listed: [
          listed({
            winnerStatus: 'not_determined',
            winners: [],
            undeterminedAwards: 1,
            clean: false,
            prices: null,
          }),
        ],
      }),
    );

    expect(screen.getByText('ยังระบุผู้ได้รับสัญญาไม่ได้')).toBeInTheDocument();
    expect(screen.queryByText(/ผู้ได้รับสัญญา:/)).not.toBeInTheDocument();
  });

  test('a joint venture is marked', async () => {
    await renderResult(
      result({
        listed: [listed({ winners: [{ name: 'กิจการร่วมค้า ตัวอย่าง', jointVenture: true }] })],
      }),
    );

    expect(screen.getByText('กิจการค้าร่วม')).toBeInTheDocument();
  });

  test.each([
    ['none', null, 'ไม่มีข้อมูลผู้เสนอราคา'],
    ['not_asked', null, 'ยังไม่ได้ดึงข้อมูลผู้เสนอราคา'],
    ['failed', null, 'ดึงข้อมูลผู้เสนอราคาไม่สำเร็จ'],
    ['read', 'unnamed_bidder', 'นับผู้เสนอราคาไม่ได้ (มีผู้ไม่ระบุชื่อ)'],
  ] as const)(
    'bidders %s (%s) say why there is no count, never a count',
    async (state, gap, text) => {
      await renderResult(
        result({
          listed: [
            listed({
              bidders: state,
              bidderCount: null,
              bidderCountGap: gap,
              clean: false,
              prices: null,
            }),
          ],
        }),
      );

      const item = screen.getByText('ประกวดราคาจ้างบำรุงรักษาระบบตัวอย่าง').closest('li')!;
      expect(fact(item, 'ผู้เสนอราคา')).toHaveTextContent(text);
      expect(fact(item, 'ผู้เสนอราคา').textContent).not.toMatch(/\d+ ราย/);
    },
  );

  test('an empty list says so in one line, or that this TOR has no budget to order by', async () => {
    const { unmount } = await renderResult(
      result({ listed: [], projects: 0, closestCount: 0, competition: null }),
    );
    expect(
      screen.getByText(
        'ไม่พบโครงการคล้ายกันในสัญญาที่เซ็นแล้วของหน่วยงานเดียวกัน 3 ปีงบประมาณล่าสุด ไม่ได้แปลว่าไม่มีคู่แข่ง',
      ),
    ).toBeInTheDocument();
    unmount();

    await renderResult(result({ listed: [], ownBudget: null, projects: 3, competition: null }));
    expect(
      screen.getByText('TOR นี้ไม่มีงบประมาณที่ตั้งไว้ จึงเรียงโครงการเทียบไม่ได้'),
    ).toBeInTheDocument();
  });

  test('an incomplete search says so in one line outside the details', async () => {
    await renderResult(result({ complete: false }));

    const warning = screen.getByText(/ค้นได้ไม่ครบ/);
    expect(warning.closest('details')).toBeNull();
  });
});

describe('TorSimilarAwards: the competition level', () => {
  test('is a single line saying what is needed when there is not enough, with no level', async () => {
    await renderResult(result({ competition: competition({ withKnownBidderCount: 3 }) }));

    expect(screen.getByText(/ยังสรุประดับการแข่งขันไม่ได้: ต้องมีอย่างน้อย/)).toHaveTextContent(
      '5 โครงการที่ทราบจำนวนผู้เสนอราคา (ตอนนี้ 3)',
    );
    expect(screen.queryByText(/^การแข่งขัน: (น้อยราย|มากราย)/)).not.toBeInTheDocument();
  });

  test('is one line with the level, the median and that it is a reading of the past, when enough', async () => {
    await renderResult(
      result({
        competition: competition({
          comparables: 6,
          withContractData: 6,
          withResolvedWinner: 5,
          withKnownBidderCount: 5,
          clean: 4,
          level: 'few',
          bidders: { min: 1, median: 2, max: 4, few: 4, many: 1 },
        }),
      }),
    );

    const line = screen.getByText(/การแข่งขัน: น้อยราย/).closest('p')!;
    expect(line).toHaveTextContent('ผู้เสนอราคามัธยฐาน 2 ราย จาก 5 โครงการ');
    expect(line).toHaveTextContent('ดูจากอดีต ไม่ใช่การคาดการณ์');
    expect(line).toHaveTextContent('อาจต่ำกว่าจริงเพราะมีเฉพาะสัญญาที่เซ็นแล้ว');
    expect(line).toHaveTextContent('เกณฑ์เป็นค่าชั่วคราว');
  });

  test('"many" is said as many', async () => {
    await renderResult(
      result({
        competition: competition({
          withKnownBidderCount: 5,
          level: 'many',
          bidders: { min: 4, median: 6, max: 9, few: 0, many: 5 },
        }),
      }),
    );

    expect(screen.getByText(/การแข่งขัน: มากราย/)).toBeInTheDocument();
  });
});

describe('TorSimilarAwards: the details are one closed block', () => {
  test('is closed by default and holds the keyword, the years, the filters and the limits', async () => {
    await renderResult(
      result({
        searches: [
          { year: 2568, total: 0, read: 0, truncated: false, outcome: 'read' },
          { year: 2569, total: 80, read: 50, truncated: true, outcome: 'read' },
          { year: 2570, total: null, read: 0, truncated: false, outcome: 'failed' },
        ],
        excluded: { ...result().excluded, otherAgency: 7, notEarlier: 2 },
        closestCount: 14,
        withoutBudget: 3,
        complete: false,
      }),
    );

    const details = screen.getByText('รายละเอียดการค้นและข้อจำกัดของข้อมูล').closest('details')!;
    expect(details.open).toBe(false);
    expect(within(details).getByText('บำรุงรักษาระบบตัวอย่าง')).toBeInTheDocument();
    expect(
      within(details).getByText('2568: พบ 0 · 2569: พบ 80 (อ่านบางส่วน) · 2570: ค้นไม่สำเร็จ'),
    ).toBeInTheDocument();
    expect(within(details).getByText(/แสดง 1 จาก 14 โครงการที่มีงบประมาณ/)).toBeInTheDocument();
    expect(within(details).getByText(/ไม่แสดง 3 โครงการที่ไม่มีงบประมาณ/)).toBeInTheDocument();
    expect(within(details).getByText(/ลดผลที่ไม่เกี่ยวข้องเท่านั้น/)).toHaveTextContent(
      'ไม่ได้พิสูจน์ว่าโครงการคล้ายกันหรือเป็นงานซอฟต์แวร์',
    );
    expect(
      within(details).getByText('ตัดออก: หน่วยงานไม่ตรงกัน 7 · ประกาศไม่ก่อน TOR นี้ 2'),
    ).toBeInTheDocument();
    expect(within(details).getByText(/มีเฉพาะสัญญาที่เซ็นแล้ว/)).toBeInTheDocument();
    expect(
      within(details).getByText(/นับผู้เสนอราคาตามชื่อที่เหมือนกันทุกตัวอักษร/),
    ).toBeInTheDocument();
    expect(within(details).getByText(/ข้อมูลผู้เสนอราคาอาจไม่มีสำหรับปีเก่า/)).toBeInTheDocument();
    expect(within(details).getByText(/ไม่ใช่ราคาที่ควรเสนอ/)).toBeInTheDocument();
  });

  test('nothing cut means no "cut" line, and the basis of the level is given when there is one', async () => {
    await renderResult(
      result({
        competition: competition({
          comparables: 6,
          withContractData: 6,
          withResolvedWinner: 5,
          withKnownBidderCount: 5,
          clean: 4,
          level: 'few',
          bidders: { min: 1, median: 2, max: 4, few: 4, many: 1 },
        }),
      }),
    );

    const details = screen.getByText('รายละเอียดการค้นและข้อจำกัดของข้อมูล').closest('details')!;
    expect(within(details).queryByText(/ตัดออก:/)).not.toBeInTheDocument();
    expect(within(details).getByText(/ฐานระดับการแข่งขัน: แสดง 6/)).toHaveTextContent(
      'ทราบจำนวนผู้เสนอราคา 5',
    );
  });

  test('says when the answer is a kept one rather than searched just now', async () => {
    await renderResult(result({ cached: true }));

    expect(screen.getByText(/ผลนี้เก็บไว้ชั่วคราวที่เซิร์ฟเวอร์ · ค้นเมื่อ/)).toBeInTheDocument();
  });
});

describe('TorSimilarAwards: when nothing was searched', () => {
  test('a TOR that is not offered', async () => {
    await renderResult(result({ status: 'not_offered', listed: [], keyword: null }));

    expect(screen.getByText('ส่วนนี้ใช้กับ TOR ที่เจ้าหน้าที่เห็นได้เท่านั้น')).toBeInTheDocument();
    expect(screen.queryByText('รายละเอียดการค้นและข้อจำกัดของข้อมูล')).not.toBeInTheDocument();
  });

  test.each([
    ['too_short', 'สั้นเกินไป'],
    ['too_generic', 'กว้างเกินไป'],
  ] as const)('a name with no keyword (%s) says it was not searched', async (skipped, word) => {
    await renderResult(
      result({ status: 'no_keyword', keyword: null, keywordSkipped: skipped, listed: [] }),
    );

    expect(
      screen.getByText(`ชื่อโครงการนี้${word}ที่จะค้นได้อย่างมีความหมาย จึงไม่ได้ค้น`),
    ).toBeInTheDocument();
  });

  test('a cooldown says it cannot be searched now, and until when', async () => {
    await renderResult(
      result({
        status: 'cooling_down',
        cooldownUntil: '2026-11-23T03:00:00.000Z',
        listed: [],
        complete: false,
      }),
    );

    expect(screen.getByText(/ยังค้นไม่ได้ในตอนนี้/)).toHaveTextContent('พักถึง');
  });
});
