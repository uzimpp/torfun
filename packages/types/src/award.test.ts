import { describe, expect, test } from 'bun:test';
import { isNamed, summariseAward } from './award';
import { digestAward, type CompetitionProject } from './competition';
import type { Contract, ContractSubmission } from './contracts';

// Fixtures only: the shapes the API publishes, with invented names.
const line = (overrides: Partial<Contract> = {}): Contract => ({
  projectId: 'p1',
  contractYear: 2569,
  contractNo: 'CN-1',
  winnerName: 'บริษัท เอ จำกัด',
  winnerTin: null,
  priceAgree: 2_830_000,
  contractDate: null,
  contractFinishDate: null,
  status: null,
  sumPriceAgree: 2_830_000,
  projectMoney: 3_000_000,
  priceBuild: 2_990_000,
  ...overrides,
});

const project: CompetitionProject = {
  projectId: 'p1',
  projectName: 'โครงการตัวอย่าง',
  deptName: 'หน่วยงานตัวอย่าง',
  budget: 3_000_000,
  budgetYear: 2569,
  announceDate: '2026-01-01T00:00:00.000Z',
};

const bid = (
  merchantName: string | null,
  submitPrice: number | null,
  seqNo: number | null = 1,
  seqNoDesc: string | null = 'รายการที่ 1',
): ContractSubmission => ({
  projectId: 'p1',
  contractYear: 2569,
  merchantName,
  seqNo,
  seqNoDesc,
  submitPrice,
});

const A = 'บริษัท เอ จำกัด';

describe('summariseAward: a single winner', () => {
  const summary = summariseAward(
    [line()],
    [bid('บริษัท บี จำกัด', 1_890_000), bid(A, 2_850_000), bid('บริษัท ซี จำกัด', 2_098_270)],
  );

  test('keeps the agreed contract price and the submitted bid as two different numbers', () => {
    const [award] = summary.awards;

    expect(summary.status).toBe('resolved');
    expect(award?.structure.kind).toBe('single');
    expect(award?.winnerName).toBe(A);
    expect(award?.agreedContractPrice).toBe(2_830_000);
    expect(award?.winnerBid?.submittedPrice).toBe(2_850_000);
    expect(award?.winnerBidUnavailable).toBeNull();
  });

  test('says how many others bid lower, without calling the agreed price a winning bid', () => {
    expect(summary.awards[0]?.winnerBid?.lowerBids).toBe(2);
  });

  test("lists the bids cheapest first, with their range and the project's bidder count", () => {
    const [item] = summary.items;

    expect(item?.bids.map((b) => b.submittedPrice)).toEqual([1_890_000, 2_098_270, 2_850_000]);
    expect(item).toMatchObject({
      seqNo: 1,
      description: 'รายการที่ 1',
      bidderCount: 3,
      lowest: 1_890_000,
      highest: 2_850_000,
      average: 2_279_423.33,
      pricedBids: 3,
    });
    expect(summary.bidderCount).toBe(3);
  });

  test('shows the project figures as published', () => {
    expect(summary).toMatchObject({
      contractYear: 2569,
      sumPriceAgree: 2_830_000,
      projectMoney: 3_000_000,
      priceBuild: 2_990_000,
    });
  });
});

describe('summariseAward: joint ventures', () => {
  const consortium = line({
    contractNo: 'JV-1',
    winnerName: 'กิจการค้าร่วม เอ็นบี',
    priceAgree: 49_450_000,
    sumPriceAgree: 49_450_000,
  });
  const memberA = line({
    contractNo: 'JV-1',
    winnerName: 'บริษัทจำกัด บริษัท ก (สัญญากิจการค้าร่วม)',
    priceAgree: 49_450_000,
    sumPriceAgree: 49_450_000,
  });
  const memberB = line({
    contractNo: 'JV-1',
    winnerName: 'บริษัทจำกัด บริษัท ข (สัญญากิจการค้าร่วม)',
    priceAgree: 0,
    sumPriceAgree: 49_450_000,
  });

  test('a consortium and its members are one award, won by the consortium', () => {
    const summary = summariseAward(
      [memberA, consortium, memberB],
      [bid('บริษัท อื่น จำกัด', 49_200_000), bid('กิจการค้าร่วม เอ็นบี', 49_500_000)],
    );

    expect(summary.status).toBe('resolved');
    expect(summary.awards).toHaveLength(1);
    const [award] = summary.awards;
    expect(award?.structure).toMatchObject({ kind: 'joint_venture', consortium });
    expect(award?.structure.kind === 'joint_venture' && award.structure.members).toEqual([
      memberA,
      memberB,
    ]);
    expect(award?.winnerName).toBe('กิจการค้าร่วม เอ็นบี');
  });

  test("member amounts are never added to the consortium's, and the aggregate is as published", () => {
    const summary = summariseAward([consortium, memberA, memberB], []);

    expect(summary.awards[0]?.agreedContractPrice).toBe(49_450_000);
    expect(summary.sumPriceAgree).toBe(49_450_000);
  });

  test("the consortium's own bid is found by its exact name", () => {
    const summary = summariseAward(
      [consortium, memberA],
      [bid('บริษัท อื่น จำกัด', 49_200_000), bid('กิจการค้าร่วม เอ็นบี', 49_500_000)],
    );

    expect(summary.awards[0]?.winnerBid).toEqual({ submittedPrice: 49_500_000, lowerBids: 1 });
  });

  test('a joint venture whose name carries no recognisable prefix is left unresolved', () => {
    const summary = summariseAward(
      [
        line({ contractNo: 'JV-2', winnerName: 'บีทามส์และเน็กซ์พิกเซล' }),
        line({ contractNo: 'JV-2', winnerName: 'บริษัทจำกัด บริษัท ก' }),
      ],
      [bid('บีทามส์และเน็กซ์พิกเซล', 43_500_000)],
    );

    expect(summary.status).toBe('unresolved');
    const [award] = summary.awards;
    expect(award).toMatchObject({
      structure: { kind: 'unresolved', reason: 'ambiguous_lines' },
      winnerName: null,
      agreedContractPrice: null,
      winnerBid: null,
      winnerBidUnavailable: 'unresolved_winner',
    });
  });

  test('two consortium-looking lines under one number are not guessed between', () => {
    const summary = summariseAward(
      [
        line({ contractNo: 'JV-3', winnerName: 'กิจการค้าร่วม เอ' }),
        line({ contractNo: 'JV-3', winnerName: 'Consortium B' }),
      ],
      [],
    );

    expect(summary.awards[0]?.structure.kind).toBe('unresolved');
  });

  test('recognises the English prefix too', () => {
    const summary = summariseAward(
      [
        line({ contractNo: 'JV-4', winnerName: 'Consortium RSS 2016' }),
        line({ contractNo: 'JV-4', winnerName: 'บริษัทมหาชนจำกัด บริษัท ก' }),
      ],
      [],
    );

    expect(summary.awards[0]?.structure.kind).toBe('joint_venture');
  });
});

describe('summariseAward: several contracts and items', () => {
  const lines = [
    line({
      contractNo: 'C-1',
      winnerName: 'บริษัท เอ จำกัด',
      priceAgree: 8_939_208,
      sumPriceAgree: 28_064_388,
    }),
    line({
      contractNo: 'C-2',
      winnerName: 'บริษัท บี จำกัด',
      priceAgree: 19_125_180,
      sumPriceAgree: 28_064_388,
    }),
  ];
  const bids = [
    bid('บริษัท เอ จำกัด', 8_339_580, 1, 'ลูกถ้วย ก'),
    bid('บริษัท บี จำกัด', 8_506_500, 1, 'ลูกถ้วย ก'),
    bid('บริษัท ซี จำกัด', 19_645_200, 2, 'ลูกถ้วย ข'),
    bid('บริษัท บี จำกัด', 19_558_530, 2, 'ลูกถ้วย ข'),
    bid('บริษัท เอ จำกัด', 781_956, 3, 'ลูกรอก'),
    bid('บริษัท บี จำกัด', 808_920, 3, 'ลูกรอก'),
  ];
  const summary = summariseAward(lines, bids);

  test('separate contract numbers are separate awards, kept as published', () => {
    expect(summary.status).toBe('resolved');
    expect(summary.awards.map((a) => [a.winnerName, a.agreedContractPrice])).toEqual([
      ['บริษัท เอ จำกัด', 8_939_208],
      ['บริษัท บี จำกัด', 19_125_180],
    ]);
    expect(summary.sumPriceAgree).toBe(28_064_388);
  });

  test("a winner's own bid is not guessed when there are several items", () => {
    for (const award of summary.awards) {
      expect(award.winnerBid).toBeNull();
      expect(award.winnerBidUnavailable).toBe('multi_item');
    }
  });

  test('counts bidders per item and, as distinct names, across the project', () => {
    expect(summary.items.map((item) => [item.seqNo, item.bidderCount])).toEqual([
      [1, 2],
      [2, 2],
      [3, 2],
    ]);
    expect(summary.bidderCount).toBe(3);
  });
});

describe('summariseAward: what it will not guess', () => {
  test('no contract lines is no award, and bids alone still show', () => {
    const summary = summariseAward([], [bid('บริษัท เอ จำกัด', 100)]);

    expect(summary.status).toBe('none');
    expect(summary.awards).toEqual([]);
    // The bids' year has no contract line, so they are not any award's bids: no count.
    expect(summary).toMatchObject({ contractYear: null, sumPriceAgree: null, bidderCount: null });
    expect(summary.bidYears).toEqual([
      { contractYear: 2569, bidderCount: 1, hasContractLine: false },
    ]);
    expect(summary.items).toHaveLength(1);
  });

  test('no bids is no count, not 0, and no winner bid', () => {
    const summary = summariseAward([line()], []);

    expect(summary.bidderCount).toBeNull();
    expect(summary.items).toEqual([]);
    expect(summary.awards[0]?.winnerBidUnavailable).toBe('no_bids');
  });

  test('an unnamed bid makes the counts null', () => {
    const summary = summariseAward([line()], [bid(A, 100), bid(null, 90)]);

    expect(summary.items[0]?.bidderCount).toBeNull();
    expect(summary.bidderCount).toBeNull();
    expect(summary.items[0]?.bids).toHaveLength(2);
  });

  test('a bid with no readable price sorts last, and is left out of the range and average', () => {
    const summary = summariseAward(
      [line()],
      [bid('บริษัท บี จำกัด', null), bid(A, 100), bid('บริษัท ซี จำกัด', 300)],
    );

    const [item] = summary.items;
    expect(item?.bids.map((b) => b.submittedPrice)).toEqual([100, 300, null]);
    expect(item).toMatchObject({ lowest: 100, highest: 300, average: 200, pricedBids: 2 });
  });

  test('a project whose bids are all unpriced has no range at all', () => {
    const [item] = summariseAward([line()], [bid(A, null)]).items;

    expect(item).toMatchObject({ lowest: null, highest: null, average: null, pricedBids: 0 });
  });

  test("the winner's bid needs an exact name: a different spacing is no match", () => {
    const summary = summariseAward([line({ winnerName: 'บริษัท เอ  จำกัด' })], [bid(A, 100)]);

    expect(summary.awards[0]?.winnerBidUnavailable).toBe('no_exact_match');
  });

  test('a name appearing twice in the item is ambiguous, so no winner bid', () => {
    const summary = summariseAward([line()], [bid(A, 100), bid(A, 90)]);

    expect(summary.awards[0]?.winnerBidUnavailable).toBe('no_exact_match');
    expect(summary.items[0]?.bidderCount).toBe(1);
  });

  test('a winner with an unpriced bid has a bid but no comparison', () => {
    const summary = summariseAward([line()], [bid(A, null), bid('บริษัท บี จำกัด', 50)]);

    expect(summary.awards[0]?.winnerBid).toEqual({ submittedPrice: null, lowerBids: null });
  });

  test('several lines with no contract number are not told apart, but a lone one is a winner', () => {
    const two = summariseAward([line({ contractNo: null }), line({ contractNo: null })], []);
    expect(two.awards[0]?.structure).toMatchObject({
      kind: 'unresolved',
      reason: 'unnumbered_lines',
    });
    expect(two.status).toBe('unresolved');

    const one = summariseAward([line({ contractNo: null })], []);
    expect(one.awards[0]?.structure.kind).toBe('single');
  });

  test('project figures the lines disagree on, or never gave, are null; so is a mixed year', () => {
    const summary = summariseAward(
      [
        line({ sumPriceAgree: 100, projectMoney: null, priceBuild: undefined, contractNo: 'C-1' }),
        line({
          sumPriceAgree: 200,
          projectMoney: null,
          priceBuild: undefined,
          contractNo: 'C-2',
          contractYear: 2570,
        }),
      ],
      [],
    );

    expect(summary).toMatchObject({
      contractYear: null,
      sumPriceAgree: null,
      projectMoney: null,
      priceBuild: null,
    });
  });

  test('the aggregate is never recomputed from the lines', () => {
    const summary = summariseAward(
      [
        line({ contractNo: 'C-1', priceAgree: 10, sumPriceAgree: 999 }),
        line({ contractNo: 'C-2', priceAgree: 20, sumPriceAgree: 999 }),
      ],
      [],
    );

    expect(summary.sumPriceAgree).toBe(999);
  });
});

describe('summariseAward: bids are never pooled across contract years', () => {
  const inYear = (
    year: number,
    merchantName: string | null,
    submitPrice: number | null,
    seqNo: number | null = 1,
  ): ContractSubmission => ({ ...bid(merchantName, submitPrice, seqNo), contractYear: year });

  const B = 'บริษัท บี จำกัด';
  const C = 'บริษัท ซี จำกัด';

  test('the same item number in two years is two items, each with its own bids and figures', () => {
    const summary = summariseAward(
      [],
      [inYear(2569, A, 300), inYear(2568, B, 100), inYear(2568, C, 200), inYear(2569, B, 500)],
    );

    expect(summary.items.map((item) => [item.contractYear, item.seqNo, item.bids.length])).toEqual([
      [2568, 1, 2],
      [2569, 1, 2],
    ]);
    expect(summary.items.map((item) => [item.lowest, item.highest, item.average])).toEqual([
      [100, 200, 150],
      [300, 500, 400],
    ]);
  });

  test('the same company bidding in two years is not one bidder: counts are per year', () => {
    const summary = summariseAward(
      [
        line({ contractYear: 2568, contractNo: 'N1' }),
        line({ contractYear: 2569, contractNo: 'N2' }),
      ],
      [inYear(2568, A, 100), inYear(2569, A, 200)],
    );

    expect(summary.bidYears).toEqual([
      { contractYear: 2568, bidderCount: 1, hasContractLine: true },
      { contractYear: 2569, bidderCount: 1, hasContractLine: true },
    ]);
    expect(summary.bidderCount).toBeNull();
  });

  test('bids of one year keep the project count as before', () => {
    const summary = summariseAward([line()], [inYear(2569, A, 100), inYear(2569, B, 200)]);

    expect(summary.bidYears).toEqual([
      { contractYear: 2569, bidderCount: 2, hasContractLine: true },
    ]);
    expect(summary.bidderCount).toBe(2);
  });

  test('a year with an unnamed bid has no count, and the others keep theirs', () => {
    const summary = summariseAward(
      [
        line({ contractYear: 2568, contractNo: 'N1' }),
        line({ contractYear: 2569, contractNo: 'N2' }),
      ],
      [inYear(2568, null, 100), inYear(2569, A, 200)],
    );

    expect(summary.bidYears).toEqual([
      { contractYear: 2568, bidderCount: null, hasContractLine: true },
      { contractYear: 2569, bidderCount: 1, hasContractLine: true },
    ]);
    expect(summary.bidderCount).toBeNull();
  });

  test('items are ordered by year, then item number with an unnumbered item last in its year', () => {
    const summary = summariseAward(
      [],
      [
        { ...inYear(2569, A, 1, null) },
        inYear(2568, A, 2, 2),
        inYear(2568, A, 3, null),
        inYear(2568, B, 4, 1),
      ],
    );

    expect(summary.items.map((item) => [item.contractYear, item.seqNo])).toEqual([
      [2568, 1],
      [2568, 2],
      [2568, null],
      [2569, null],
    ]);
    expect(summary.bidYears.map((year) => year.contractYear)).toEqual([2568, 2569]);
  });

  test('unnumbered bids of one year form one item, and not one with those of another year', () => {
    const summary = summariseAward(
      [],
      [inYear(2568, A, 1, null), inYear(2568, B, 2, null), inYear(2569, A, 3, null)],
    );

    expect(summary.items.map((item) => [item.contractYear, item.seqNo, item.bids.length])).toEqual([
      [2568, null, 2],
      [2569, null, 1],
    ]);
  });

  test('no bids give no years and no count', () => {
    expect(summariseAward([line()], [])).toMatchObject({ bidYears: [], bidderCount: null });
  });

  test('a winner is matched only against the bids of its own year', () => {
    const summary = summariseAward(
      [line({ contractYear: 2569, winnerName: A, priceAgree: 90 })],
      [inYear(2568, A, 80), inYear(2568, B, 70), inYear(2569, A, 100), inYear(2569, C, 60)],
    );

    expect(summary.awards[0]).toMatchObject({
      winnerBid: { submittedPrice: 100, lowerBids: 1 },
      winnerBidUnavailable: null,
    });
  });

  test('a winner with bids only in another year has no winner bid, and none is borrowed', () => {
    const summary = summariseAward(
      [line({ contractYear: 2569, winnerName: A })],
      [inYear(2568, A, 80), inYear(2568, B, 70)],
    );

    expect(summary.awards[0]).toMatchObject({
      winnerBid: null,
      winnerBidUnavailable: 'bids_in_other_year',
    });
  });

  test('no bids at all stays no_bids, and bids of another year are the distinct reason', () => {
    const own = line({ contractYear: 2569, winnerName: A });

    expect(summariseAward([own], []).awards[0]!.winnerBidUnavailable).toBe('no_bids');
    expect(summariseAward([own], [inYear(2568, A, 80)]).awards[0]!.winnerBidUnavailable).toBe(
      'bids_in_other_year',
    );
    // Bids of its own year, even with another year's beside them, are not "other year".
    expect(
      summariseAward([own], [inYear(2568, B, 70), inYear(2569, A, 80)]).awards[0]!
        .winnerBidUnavailable,
    ).toBeNull();
  });

  describe('the project bidder count follows the same year eligibility as #144', () => {
    test('bids of a year with no contract line give no project count, while the year keeps its own', () => {
      const summary = summariseAward(
        [line({ contractYear: 2569 })],
        [inYear(2568, A, 80), inYear(2568, B, 70)],
      );

      expect(summary.bidderCount).toBeNull();
      expect(summary.bidYears).toEqual([
        { contractYear: 2568, bidderCount: 2, hasContractLine: false },
      ]);
    });

    test('with a contract line of the bids’ year the project count is given', () => {
      const summary = summariseAward(
        [line({ contractYear: 2568 })],
        [inYear(2568, A, 80), inYear(2568, B, 70)],
      );

      expect(summary.bidderCount).toBe(2);
    });

    test('the summary and the #144 digest agree on whether the count is known', () => {
      for (const [contractYear, bidYear] of [
        [2569, 2569],
        [2569, 2568],
      ] as const) {
        const contracts = [line({ contractYear })];
        const bids = [inYear(bidYear, A, 80), inYear(bidYear, B, 70)];
        const summary = summariseAward(contracts, bids);

        expect(digestAward(project, summary).bidderCount).toBe(summary.bidderCount);
      }
    });
  });

  test('several items in the winner’s own year are still not guessed at', () => {
    const summary = summariseAward(
      [line({ contractYear: 2569, winnerName: A })],
      [inYear(2569, A, 100, 1), inYear(2569, A, 200, 2)],
    );

    expect(summary.awards[0]).toMatchObject({
      winnerBid: null,
      winnerBidUnavailable: 'multi_item',
    });
  });

  test('one item in the winner’s year is matched even when another year has several', () => {
    const summary = summariseAward(
      [line({ contractYear: 2569, winnerName: A })],
      [inYear(2568, A, 1, 1), inYear(2568, B, 2, 2), inYear(2569, A, 100, 1)],
    );

    expect(summary.awards[0]).toMatchObject({ winnerBid: { submittedPrice: 100, lowerBids: 0 } });
  });

  test('a joint venture uses its consortium line\u2019s year for the winner\u2019s own bid', () => {
    const consortium = 'กิจการค้าร่วม เอ็นบี';
    const summary = summariseAward(
      [
        line({ contractNo: 'JV', contractYear: 2569, winnerName: consortium }),
        line({ contractNo: 'JV', contractYear: 2569, winnerName: A, priceAgree: 0 }),
      ],
      [inYear(2568, consortium, 50), inYear(2569, consortium, 100)],
    );

    expect(summary.awards).toHaveLength(1);
    expect(summary.awards[0]).toMatchObject({
      structure: { kind: 'joint_venture' },
      winnerBid: { submittedPrice: 100 },
    });
  });

  test('no date decides anything: contract dates never change which bids are matched', () => {
    const base = summariseAward(
      [line({ contractYear: 2569, contractDate: '1 ม.ค. 69' })],
      [inYear(2568, A, 80), inYear(2569, A, 100)],
    );
    const other = summariseAward(
      [line({ contractYear: 2569, contractDate: '31 ธ.ค. 60' })],
      [inYear(2568, A, 80), inYear(2569, A, 100)],
    );

    expect(other.awards[0]).toEqual({
      ...base.awards[0]!,
      structure: { kind: 'single', contract: expect.any(Object) },
    });
    expect(base.awards[0]).toMatchObject({ winnerBid: { submittedPrice: 100 } });
  });
});

describe('summariseAward: contract lines of different years are never merged', () => {
  const CONSORTIUM = 'กิจการค้าร่วม เอ็นบี';
  const B = 'บริษัท บี จำกัด';
  const unresolvedOf = (summary: ReturnType<typeof summariseAward>) =>
    summary.awards.map((award) =>
      award.structure.kind === 'unresolved'
        ? [award.structure.reason, award.structure.contracts.map((c) => c.contractYear)]
        : award.structure.kind,
    );

  test('the same contract number in two years is two separate awards, and neither names a winner', () => {
    const summary = summariseAward(
      [
        line({ contractNo: 'C-1', contractYear: 2568, winnerName: A, priceAgree: 100 }),
        line({ contractNo: 'C-1', contractYear: 2569, winnerName: B, priceAgree: 200 }),
      ],
      [],
    );

    expect(summary.status).toBe('unresolved');
    expect(unresolvedOf(summary)).toEqual([
      ['number_in_other_year', [2568]],
      ['number_in_other_year', [2569]],
    ]);
    expect(summary.awards.map((award) => [award.winnerName, award.agreedContractPrice])).toEqual([
      [null, null],
      [null, null],
    ]);
  });

  test('a consortium of one year and a zero-price member of another are neither merged nor named winners', () => {
    const summary = summariseAward(
      [
        line({
          contractNo: 'JV',
          contractYear: 2569,
          winnerName: CONSORTIUM,
          priceAgree: 49_450_000,
        }),
        line({ contractNo: 'JV', contractYear: 2568, winnerName: A, priceAgree: 0 }),
      ],
      [{ ...bid(A, 10), contractYear: 2568 }],
    );

    expect(unresolvedOf(summary)).toEqual([
      ['number_in_other_year', [2569]],
      ['number_in_other_year', [2568]],
    ]);
    for (const award of summary.awards) {
      expect(award).toMatchObject({
        winnerName: null,
        agreedContractPrice: null,
        winnerBid: null,
        winnerBidUnavailable: 'unresolved_winner',
      });
    }
    expect(summary.awards.some((award) => award.structure.kind === 'joint_venture')).toBe(false);
  });

  test('the lines of an unresolved award are kept as published, with their own year and price', () => {
    const summary = summariseAward(
      [
        line({ contractNo: 'JV', contractYear: 2569, winnerName: CONSORTIUM, priceAgree: 5 }),
        line({ contractNo: 'JV', contractYear: 2568, winnerName: A, priceAgree: 0 }),
      ],
      [],
    );

    const lines = summary.awards.flatMap((award) =>
      award.structure.kind === 'unresolved'
        ? award.structure.contracts.map((c) => [c.contractYear, c.winnerName, c.priceAgree])
        : [],
    );
    expect(lines).toEqual([
      [2569, CONSORTIUM, 5],
      [2568, A, 0],
    ]);
  });

  test('a lone line stays a winner when its number appears in no other year', () => {
    const summary = summariseAward(
      [
        line({ contractNo: 'C-1', contractYear: 2568, winnerName: A }),
        line({ contractNo: 'C-2', contractYear: 2569, winnerName: B }),
      ],
      [],
    );

    expect(summary.status).toBe('resolved');
    expect(summary.awards.map((award) => [award.structure.kind, award.winnerName])).toEqual([
      ['single', A],
      ['single', B],
    ]);
  });

  test('the same joint venture pattern in two years is two joint ventures, each with its own members', () => {
    const summary = summariseAward(
      [
        line({ contractNo: 'JV', contractYear: 2568, winnerName: CONSORTIUM }),
        line({ contractNo: 'JV', contractYear: 2568, winnerName: A, priceAgree: 0 }),
        line({ contractNo: 'JV', contractYear: 2569, winnerName: CONSORTIUM }),
        line({ contractNo: 'JV', contractYear: 2569, winnerName: B, priceAgree: 0 }),
      ],
      [],
    );

    expect(summary.status).toBe('resolved');
    expect(summary.awards).toHaveLength(2);
    const members = summary.awards.map((award) =>
      award.structure.kind === 'joint_venture'
        ? award.structure.members.map((member) => [member.contractYear, member.winnerName])
        : null,
    );
    expect(members).toEqual([[[2568, A]], [[2569, B]]]);
  });

  test('a complete joint venture in one year and a lone line of the same number in another: only the lone one is unresolved', () => {
    const summary = summariseAward(
      [
        line({ contractNo: 'JV', contractYear: 2569, winnerName: CONSORTIUM }),
        line({ contractNo: 'JV', contractYear: 2569, winnerName: A, priceAgree: 0 }),
        line({ contractNo: 'JV', contractYear: 2568, winnerName: B, priceAgree: 0 }),
      ],
      [],
    );

    expect(unresolvedOf(summary)).toEqual(['joint_venture', ['number_in_other_year', [2568]]]);
    expect(summary.awards[0]).toMatchObject({ winnerName: CONSORTIUM });
    expect(summary.awards[1]).toMatchObject({ winnerName: null });
  });

  test('an ambiguous group stays within its own year, and a lone line of another year is unresolved apart', () => {
    const summary = summariseAward(
      [
        line({ contractNo: 'X', contractYear: 2568, winnerName: A }),
        line({ contractNo: 'X', contractYear: 2568, winnerName: B }),
        line({ contractNo: 'X', contractYear: 2569, winnerName: A }),
      ],
      [],
    );

    expect(unresolvedOf(summary)).toEqual([
      ['ambiguous_lines', [2568, 2568]],
      ['number_in_other_year', [2569]],
    ]);
  });

  test('lines with no contract number are grouped per year, never across years', () => {
    const summary = summariseAward(
      [
        line({ contractNo: null, contractYear: 2569, winnerName: A }),
        line({ contractNo: null, contractYear: 2568, winnerName: B }),
        line({ contractNo: null, contractYear: 2568, winnerName: A }),
      ],
      [],
    );

    expect(unresolvedOf(summary)).toEqual([
      ['unnumbered_lines', [2568, 2568]],
      ['unnumbered_lines', [2569]],
    ]);
  });

  test('within one year the grouping is as it was: a consortium with its members, and separate numbers apart', () => {
    const summary = summariseAward(
      [
        line({ contractNo: 'JV', contractYear: 2569, winnerName: CONSORTIUM }),
        line({ contractNo: 'JV', contractYear: 2569, winnerName: A, priceAgree: 0 }),
        line({ contractNo: 'JV', contractYear: 2569, winnerName: B, priceAgree: 0 }),
        line({ contractNo: 'C-2', contractYear: 2569, winnerName: B }),
      ],
      [],
    );

    expect(summary.status).toBe('resolved');
    expect(summary.awards).toHaveLength(2);
    const first = summary.awards[0]!.structure;
    expect(first.kind === 'joint_venture' && first.members.map((m) => m.winnerName)).toEqual([
      A,
      B,
    ]);
    expect(summary.awards[1]!.structure).toMatchObject({ kind: 'single' });
  });

  test('a lone line in a single-year project is a winner as before, even with a number shared by nobody', () => {
    const summary = summariseAward([line({ contractNo: 'ONLY', winnerName: A })], []);

    expect(summary.status).toBe('resolved');
    expect(summary.awards[0]).toMatchObject({ structure: { kind: 'single' }, winnerName: A });
  });

  test('an unresolved award in one year does not turn the awards of other numbers unresolved', () => {
    const summary = summariseAward(
      [
        line({ contractNo: 'X', contractYear: 2568, winnerName: A }),
        line({ contractNo: 'X', contractYear: 2568, winnerName: B }),
        line({ contractNo: 'Y', contractYear: 2569, winnerName: B }),
      ],
      [],
    );

    expect(summary.status).toBe('unresolved');
    expect(summary.awards.map((award) => award.structure.kind)).toEqual(['unresolved', 'single']);
  });
});

describe('summariseAward: a blank name is a missing name', () => {
  const inYear = (year: number, name: string | null, price: number): ContractSubmission => ({
    ...bid(name, price),
    contractYear: year,
  });

  test.each(['', ' ', '   ', '\t', '\n', ' \t\n '])('isNamed refuses %p', (name) => {
    expect(isNamed(name)).toBe(false);
  });

  test('isNamed accepts a name, and refuses null and undefined', () => {
    expect(isNamed(A)).toBe(true);
    expect(isNamed(' A ')).toBe(true);
    expect(isNamed(null)).toBe(false);
    expect(isNamed(undefined)).toBe(false);
  });

  test.each(['', '   ', '\t\n'])(
    'a bidder named %p is unnamed: the item and project counts are unknown, not a count',
    (blank) => {
      const summary = summariseAward(
        [line()],
        [bid(A, 1), bid(blank, 2), bid('บริษัท บี จำกัด', 3)],
      );

      expect(summary.items[0]!.bidderCount).toBeNull();
      expect(summary.bidderCount).toBeNull();
      expect(summary.bidYears).toEqual([
        { contractYear: 2569, bidderCount: null, hasContractLine: true },
      ]);
    },
  );

  test('a blank bidder name is carried as missing, so it is shown and sorted as an unnamed bid', () => {
    const summary = summariseAward([], [bid('', 5), bid(A, 9)]);

    expect(summary.items[0]!.bids.map((entry) => entry.merchantName)).toEqual([null, A]);
  });

  test('a blank bidder in one year leaves only that year without a count', () => {
    const summary = summariseAward(
      [
        line({ contractYear: 2568, contractNo: 'N1' }),
        line({ contractYear: 2569, contractNo: 'N2' }),
      ],
      [inYear(2568, '  ', 1), inYear(2569, A, 2)],
    );

    expect(summary.bidYears).toEqual([
      { contractYear: 2568, bidderCount: null, hasContractLine: true },
      { contractYear: 2569, bidderCount: 1, hasContractLine: true },
    ]);
  });

  test('names are still compared exactly: a trailing space is a different bidder, never trimmed away', () => {
    const summary = summariseAward([line()], [bid(A, 1), bid(`${A} `, 2)]);

    expect(summary.bidderCount).toBe(2);
    expect(summary.items[0]!.bids.map((entry) => entry.merchantName)).toEqual([A, `${A} `]);
  });

  test.each(['', '   ', '\t'])(
    'a winner named %p has no name, and is matched to no bid, blank or not',
    (blank) => {
      const summary = summariseAward(
        [line({ winnerName: blank })],
        [bid(blank, 100), bid('บริษัท บี จำกัด', 200)],
      );

      expect(summary.awards[0]).toMatchObject({
        winnerName: null,
        winnerBid: null,
        winnerBidUnavailable: 'no_exact_match',
      });
    },
  );

  test('a named winner is matched exactly as before', () => {
    const summary = summariseAward(
      [line({ winnerName: A })],
      [bid(A, 100), bid('บริษัท บี จำกัด', 200)],
    );

    expect(summary.awards[0]).toMatchObject({ winnerName: A, winnerBid: { submittedPrice: 100 } });
  });
});
