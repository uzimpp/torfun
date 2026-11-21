import { describe, expect, test } from 'bun:test';
import { summariseAward } from './award';
import type { Contract, ContractSubmission } from './contracts';

// Fixtures only: the shapes the API publishes (see docs/research/bid-strategy), with invented names.
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
    expect(summary).toMatchObject({ contractYear: null, sumPriceAgree: null, bidderCount: 1 });
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
