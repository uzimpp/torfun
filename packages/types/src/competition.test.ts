import { describe, expect, test } from 'bun:test';
import { summariseAward } from './award';
import {
  COMPETITION_MIN_SAMPLE,
  DEFAULT_COMPETITION_THRESHOLDS,
  PROVISIONAL_FEW_BIDDERS_MAX,
  closestAwardDigests,
  competitionLevel,
  digestAward,
  digestFromLines,
  repeatWinners,
  type AwardDigest,
  type CompetitionProject,
} from './competition';
import { BUDGET_COMPARISON_MAX_PROJECTS, compareBudget } from './budget-comparison';
import type { Contract, ContractSubmission } from './contracts';

// Fixtures only: invented projects, names and amounts. Nothing here is real data.
const project = (overrides: Partial<CompetitionProject> = {}): CompetitionProject => ({
  projectId: 'p1',
  projectName: 'โครงการตัวอย่าง',
  deptName: 'หน่วยงาน ก',
  budget: 3_000_000,
  budgetYear: 2568,
  announceDate: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

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
  contractYear = 2569,
): ContractSubmission => ({
  projectId: 'p1',
  contractYear,
  merchantName,
  seqNo,
  seqNoDesc: 'รายการที่ 1',
  submitPrice,
});

const A = 'บริษัท เอ จำกัด';
const B = 'บริษัท บี จำกัด';
const C = 'บริษัท ซี จำกัด';
const CONSORTIUM = 'กิจการค้าร่วม เอ็นบี';

let sequence = 0;
const digest = (contracts: Contract[], submissions: ContractSubmission[], budget = 3_000_000) =>
  digestAward(
    project({ budget, projectId: `d${(sequence += 1)}` }),
    summariseAward(contracts, submissions),
  );

describe('digestAward: a clean award', () => {
  const clean = digest([line()], [bid(A, 2_850_000), bid(B, 1_890_000), bid(C, 2_098_270)]);

  test('names the winner and the agreed price, with the bidder count and the average bid', () => {
    expect(clean).toMatchObject({
      hasContractData: true,
      winnerStatus: 'resolved',
      winners: [{ name: A, jointVenture: false }],
      bidderCount: 3,
      bidderCountGap: null,
      clean: true,
    });
    expect(clean.prices).toMatchObject({
      agreedPrice: 2_830_000,
      pricedBids: 3,
    });
    expect(clean.prices!.averageBid).toBeCloseTo(2_279_423.33, 2);
    expect(clean.prices!.agreedToBudget).toBeCloseTo(2_830_000 / 3_000_000, 10);
    expect(clean.prices!.exceedsBudget).toBe(false);
  });

  test('uses the agreed contract price, never the winner’s bid or the published aggregate', () => {
    const summary = digest(
      [line({ priceAgree: 100, sumPriceAgree: 999 })],
      [bid(A, 250), bid(B, 300)],
      1_000,
    );

    expect(summary.prices!.agreedPrice).toBe(100);
    expect(summary.prices!.agreedToBudget).toBeCloseTo(0.1, 10);
    expect(Object.keys(summary.prices!).some((key) => /win|submitted/i.test(key))).toBe(false);
  });

  test('an agreed price above the planned budget is shown as it is, never capped', () => {
    const over = digest([line({ priceAgree: 3_300_000 })], [bid(A, 3_400_000), bid(B, 3_500_000)]);

    expect(over.prices!.agreedToBudget).toBeCloseTo(1.1, 10);
    expect(over.prices!.exceedsBudget).toBe(true);
  });

  test('an unknown or zero budget gives no ratio, and an unpublished price none either', () => {
    expect(digest([line()], [bid(A, 1)], 0).prices!.agreedToBudget).toBeNull();
    expect(
      digestAward(project({ budget: null }), summariseAward([line()], [bid(A, 1)])).prices!
        .agreedToBudget,
    ).toBeNull();
    const unpublished = digest([line({ priceAgree: null })], [bid(A, 1)]);
    expect(unpublished.prices).toMatchObject({ agreedPrice: null, agreedToBudget: null });
    expect(unpublished.prices!.exceedsBudget).toBe(false);
  });

  test('an average bid needs priced bids: with none the average is empty, not 0', () => {
    const unpriced = digest([line()], [bid(A, null), bid(B, null)]);

    expect(unpriced.clean).toBe(true);
    expect(unpriced.prices).toMatchObject({ averageBid: null, pricedBids: 0 });
  });

  test('digestFromLines is digestAward over summariseAward', () => {
    const contracts = [line()];
    const bids = [bid(A, 10), bid(B, 20)];

    expect(digestFromLines(project(), contracts, bids)).toEqual(
      digestAward(project(), summariseAward(contracts, bids)),
    );
  });
});

describe('digestAward: missing bidder data', () => {
  test('no bids: the count is empty, never 0, and the award is not clean', () => {
    const result = digest([line()], []);

    expect(result).toMatchObject({
      bidderCount: null,
      bidderCountGap: 'no_bids',
      clean: false,
      prices: null,
      winnerStatus: 'resolved',
    });
  });

  test('an unnamed bidder makes the count unknown rather than guessing it', () => {
    const result = digest([line()], [bid(A, 10), bid(null, 20)]);

    expect(result).toMatchObject({
      bidderCount: null,
      bidderCountGap: 'unnamed_bidder',
      clean: false,
    });
    expect(result.prices).toBeNull();
  });

  test('bids with no contract line are not a past award', () => {
    const result = digest([], [bid(A, 10), bid(B, 20)]);

    expect(result).toMatchObject({ hasContractData: false, winnerStatus: 'none', winners: [] });
    expect(result.clean).toBe(false);
  });
});

describe('digestAward: several contract years', () => {
  test('bids of two years have no single count, and the award is not clean', () => {
    const result = digest(
      [line({ contractYear: 2569 })],
      [bid(A, 10, 1, 2568), bid(B, 20, 1, 2568), bid(A, 30, 1, 2569)],
    );

    expect(result).toMatchObject({
      bidderCount: null,
      bidderCountGap: 'several_years',
      clean: false,
    });
    expect(result.prices).toBeNull();
  });

  test('contract lines of two years are not one clean award', () => {
    const result = digest(
      [
        line({ contractNo: 'C-1', contractYear: 2568 }),
        line({ contractNo: 'C-2', contractYear: 2569, winnerName: B }),
      ],
      [bid(A, 10, 1, 2569), bid(B, 20, 1, 2569)],
    );

    expect(result.clean).toBe(false);
    expect(result.prices).toBeNull();
  });

  test('bids of a year the project has no contract line for are not its award bids: the count is left empty', () => {
    const result = digest(
      [line({ contractYear: 2569 })],
      [bid(A, 10, 1, 2568), bid(B, 20, 1, 2568)],
    );

    expect(result).toMatchObject({
      bidderCount: null,
      bidderCountGap: 'year_without_contract',
      clean: false,
      prices: null,
    });
  });
});

describe('digestAward: several items and several contracts', () => {
  test('several items: the count is the distinct companies, but no price figure is given', () => {
    const result = digest([line()], [bid(A, 10, 1), bid(B, 20, 1), bid(A, 30, 2), bid(C, 40, 2)]);

    expect(result.bidderCount).toBe(3);
    expect(result.clean).toBe(false);
    expect(result.prices).toBeNull();
  });

  test('two contracts of one project are not clean, and both resolved winners are listed', () => {
    const result = digest(
      [line({ contractNo: 'C-1', winnerName: A }), line({ contractNo: 'C-2', winnerName: B })],
      [bid(A, 10), bid(B, 20)],
    );

    expect(result.winners.map((winner) => winner.name)).toEqual([A, B]);
    expect(result.clean).toBe(false);
    expect(result.prices).toBeNull();
    expect(result.bidderCount).toBe(2);
  });
});

describe('digestAward: a winner that is not determined', () => {
  test('ambiguous lines name no winner and give no price, but the bidder count is kept', () => {
    const result = digest(
      [line({ contractNo: 'X', winnerName: A }), line({ contractNo: 'X', winnerName: B })],
      [bid(A, 10), bid(B, 20), bid(C, 30)],
    );

    expect(result).toMatchObject({
      winnerStatus: 'not_determined',
      winners: [],
      undeterminedAwards: 1,
      bidderCount: 3,
      clean: false,
      prices: null,
    });
  });

  test('a number used in another year leaves the lone line undetermined too', () => {
    const result = digest(
      [
        line({ contractNo: 'JV', contractYear: 2569, winnerName: CONSORTIUM }),
        line({ contractNo: 'JV', contractYear: 2568, winnerName: A, priceAgree: 0 }),
      ],
      [bid(A, 10), bid(B, 20)],
    );

    expect(result.winnerStatus).toBe('not_determined');
    expect(result.winners).toEqual([]);
    expect(result.undeterminedAwards).toBe(2);
    expect(result.clean).toBe(false);
  });

  test('a resolved award beside an undetermined one makes the project not determined, and not clean', () => {
    const result = digest(
      [
        line({ contractNo: 'Y', winnerName: A }),
        line({ contractNo: 'X', winnerName: A }),
        line({ contractNo: 'X', winnerName: B }),
      ],
      [bid(A, 10), bid(B, 20)],
    );

    expect(result.winnerStatus).toBe('not_determined');
    expect(result.winners.map((winner) => winner.name)).toEqual([A]);
    expect(result.clean).toBe(false);
  });
});

describe('digestAward: joint ventures', () => {
  const jv = [
    line({ contractNo: 'JV', winnerName: CONSORTIUM, priceAgree: 49_450_000 }),
    line({ contractNo: 'JV', winnerName: A, priceAgree: 0 }),
    line({ contractNo: 'JV', winnerName: B, priceAgree: 0 }),
  ];

  test('the consortium is the winner and one bidder; the members are neither', () => {
    const result = digest(jv, [bid(CONSORTIUM, 49_500_000), bid(C, 50_000_000)], 50_000_000);

    expect(result.winners).toEqual([{ name: CONSORTIUM, jointVenture: true }]);
    expect(result.bidderCount).toBe(2);
    expect(result.clean).toBe(true);
  });

  test('the agreed price is the consortium line’s; member amounts are not added', () => {
    const result = digest(
      [
        ...jv.slice(0, 1),
        line({ contractNo: 'JV', winnerName: A, priceAgree: 1_000 }),
        line({ contractNo: 'JV', winnerName: B, priceAgree: 2_000 }),
      ],
      [bid(CONSORTIUM, 1), bid(C, 2)],
      50_000_000,
    );

    expect(result.prices!.agreedPrice).toBe(49_450_000);
  });

  test('a joint venture whose name has no recognisable prefix is not determined', () => {
    const result = digest(
      [
        line({ contractNo: 'JV', winnerName: 'เอ็นบี', priceAgree: 5 }),
        line({ contractNo: 'JV', winnerName: A, priceAgree: 0 }),
      ],
      [bid(A, 1), bid(B, 2)],
    );

    expect(result.winnerStatus).toBe('not_determined');
    expect(result.winners).toEqual([]);
    expect(result.prices).toBeNull();
  });
});

describe('competitionLevel: the threshold and the minimum are provisional parameters', () => {
  test('the defaults are the minimum of 5 and a boundary of 3, said to be provisional', () => {
    expect(COMPETITION_MIN_SAMPLE).toBe(5);
    expect(PROVISIONAL_FEW_BIDDERS_MAX).toBe(3);
    expect(DEFAULT_COMPETITION_THRESHOLDS).toEqual({ fewMax: 3 });
    expect(competitionLevel([]).thresholds).toEqual({ fewMax: 3, provisional: true });
  });

  test('a different boundary changes the level without changing the logic', () => {
    const digests = digestsWithCounts([3, 3, 3, 3, 3]);

    expect(competitionLevel(digests).level).toBe('few');
    expect(competitionLevel(digests, { thresholds: { fewMax: 2 } }).level).toBe('many');
    expect(competitionLevel(digests, { thresholds: { fewMax: 2 } }).thresholds).toEqual({
      fewMax: 2,
      provisional: true,
    });
  });

  test('a different minimum sample is honoured', () => {
    const digests = digestsWithCounts([2, 2, 2]);

    expect(competitionLevel(digests).level).toBeNull();
    expect(competitionLevel(digests, { minSample: 3 }).level).toBe('few');
  });

  test.each([0, -1, 1.5, Number.NaN])('an invalid boundary %p is refused', (fewMax) => {
    expect(() => competitionLevel([], { thresholds: { fewMax } })).toThrow(RangeError);
  });

  test.each([0, -2, 2.5])('an invalid minimum %p is refused', (minSample) => {
    expect(() => competitionLevel([], { minSample })).toThrow(RangeError);
  });
});

// A digest with a known bidder count and the given winner status, built through the real logic.
function digestsWithCounts(counts: number[], overrides: Partial<CompetitionProject> = {}) {
  return counts.map((count, index): AwardDigest => {
    const names = Array.from({ length: count }, (_, i) => `บริษัท ${index}-${i} จำกัด`);
    return digestAward(
      project({ projectId: `c${index}`, ...overrides }),
      summariseAward(
        [line({ projectId: `c${index}`, winnerName: names[0]! })],
        names.map((name) => bid(name, 100)),
      ),
    );
  });
}

describe('competitionLevel: the level and what it is read from', () => {
  test('below five comparables with a known count there is no level and no statistic', () => {
    const result = competitionLevel(digestsWithCounts([1, 2, 3, 4]));

    expect(result).toMatchObject({ level: null, bidders: null, withKnownBidderCount: 4 });
  });

  test('exactly five give a level and the numbers behind it', () => {
    const result = competitionLevel(digestsWithCounts([1, 2, 3, 4, 5]));

    expect(result.level).toBe('few');
    expect(result.bidders).toEqual({ min: 1, median: 3, max: 5, few: 3, many: 2 });
  });

  test('a median of 3 is few and a median of 4 is many', () => {
    expect(competitionLevel(digestsWithCounts([3, 3, 3, 3, 3])).level).toBe('few');
    expect(competitionLevel(digestsWithCounts([4, 4, 4, 4, 4])).level).toBe('many');
  });

  test('the median of an even number of comparables is the mean of the middle two', () => {
    const result = competitionLevel(digestsWithCounts([1, 2, 3, 4, 5, 6]));

    expect(result.bidders!.median).toBe(3.5);
    expect(result.level).toBe('many');
  });

  test('a median between two whole counts is compared with the boundary as it is: 3.5 is many, 2.5 is few', () => {
    // Few is a median up to the boundary, many is anything above it.
    const aboveBoundary = competitionLevel(digestsWithCounts([1, 2, 3, 4, 5, 6]));
    expect(aboveBoundary.bidders!.median).toBe(3.5);
    expect(aboveBoundary.level).toBe('many');

    const belowBoundary = competitionLevel(digestsWithCounts([1, 2, 2, 3, 5, 6]));
    expect(belowBoundary.bidders!.median).toBe(2.5);
    expect(belowBoundary.level).toBe('few');
  });

  test('the same rule holds for a configured boundary: a median of boundary + 0.5 is many', () => {
    const result = competitionLevel(digestsWithCounts([1, 2, 4, 5, 6, 7]), {
      thresholds: { fewMax: 4 },
    });

    expect(result.bidders!.median).toBe(4.5);
    expect(result.level).toBe('many');
  });

  test('the level follows the median, not the mean', () => {
    const result = competitionLevel(digestsWithCounts([1, 1, 1, 1, 12]));

    expect(result.level).toBe('few');
    expect(result.bidders).toMatchObject({ median: 1, max: 12, few: 4, many: 1 });
  });

  test('every count is the basis: the narrowing of comparables is reported', () => {
    const result = competitionLevel(digestsWithCounts([2, 2, 2, 2, 2, 2]));

    expect(result).toMatchObject({
      comparables: 6,
      withContractData: 6,
      withResolvedWinner: 6,
      withKnownBidderCount: 6,
      clean: 6,
    });
  });

  test('no comparables is no level', () => {
    expect(competitionLevel([])).toMatchObject({
      comparables: 0,
      level: null,
      bidders: null,
      withKnownBidderCount: 0,
    });
  });
});

describe('competitionLevel: what is left out, and never counted as zero', () => {
  test('missing bidder data is left out and reported by reason, never read as 0 or 1', () => {
    const known = digestsWithCounts([2, 2, 2, 2, 2]);
    const gaps = [
      digest([line()], []), // no bids
      digest([line()], [bid(A, 1), bid(null, 2)]), // an unnamed bidder
      digest([line()], [bid(A, 1, 1, 2568), bid(B, 2, 1, 2569)]), // two bid years
    ];

    const result = competitionLevel([...known, ...gaps]);

    expect(result).toMatchObject({
      comparables: 8,
      withContractData: 8,
      withKnownBidderCount: 5,
      unknownBidderCounts: { no_bids: 1, unnamed_bidder: 1, several_years: 1 },
      level: 'few',
    });
    expect(result.bidders).toMatchObject({ min: 2, median: 2, max: 2 });
  });

  test('bids with no contract data are left out of the level and of the basis', () => {
    const known = digestsWithCounts([5, 5, 5, 5]);
    const bidsOnly = digest([], [bid(A, 1), bid(B, 2), bid(C, 3)]);

    const result = competitionLevel([...known, bidsOnly]);

    expect(result).toMatchObject({ comparables: 5, withContractData: 4, withKnownBidderCount: 4 });
    expect(result.level).toBeNull();
  });

  test('several years of bids are left out, so a project with them cannot move the level', () => {
    const known = digestsWithCounts([2, 2, 2, 2]);
    const multiYear = digest(
      [line()],
      [
        bid(A, 1, 1, 2568),
        bid(B, 2, 1, 2568),
        bid(C, 3, 1, 2568),
        bid('บริษัท ดี จำกัด', 4, 1, 2569),
      ],
    );

    const result = competitionLevel([...known, multiYear]);

    expect(result.withKnownBidderCount).toBe(4);
    expect(result.unknownBidderCounts.several_years).toBe(1);
    expect(result.level).toBeNull();
  });

  test('several items still count their distinct companies, though they are not clean', () => {
    const known = digestsWithCounts([2, 2, 2, 2]);
    const multiItem = digest([line()], [bid(A, 1, 1), bid(B, 2, 1), bid(A, 3, 2), bid(C, 4, 2)]);

    const result = competitionLevel([...known, multiItem]);

    expect(result.withKnownBidderCount).toBe(5);
    expect(result.clean).toBe(4);
    expect(result.bidders!.max).toBe(3);
  });

  test('an undetermined winner still counts toward the level, and is not a resolved winner', () => {
    const known = digestsWithCounts([4, 4, 4, 4]);
    const undetermined = digest(
      [line({ contractNo: 'X', winnerName: A }), line({ contractNo: 'X', winnerName: B })],
      [bid(A, 1), bid(B, 2), bid(C, 3), bid('บริษัท ดี จำกัด', 4)],
    );

    const result = competitionLevel([...known, undetermined]);

    expect(result).toMatchObject({
      withKnownBidderCount: 5,
      withResolvedWinner: 4,
      clean: 4,
      level: 'many',
    });
  });

  test('a joint venture counts as one bidder', () => {
    const known = digestsWithCounts([2, 2, 2, 2]);
    const jv = digest(
      [
        line({ contractNo: 'JV', winnerName: CONSORTIUM }),
        line({ contractNo: 'JV', winnerName: A, priceAgree: 0 }),
        line({ contractNo: 'JV', winnerName: B, priceAgree: 0 }),
      ],
      [bid(CONSORTIUM, 10), bid(C, 20)],
    );

    const result = competitionLevel([...known, jv]);

    expect(jv.bidderCount).toBe(2);
    expect(result.bidders).toMatchObject({ min: 2, max: 2 });
  });
});

describe('bidder-data limits are stated, and names are never guessed or matched', () => {
  test('one company under different spellings counts as different bidders', () => {
    const result = digest(
      [line()],
      [
        bid('บริษัท เอ จำกัด', 1),
        bid('บริษัท เอ  จำกัด', 2),
        bid('บจก. เอ', 3),
        bid('บริษัท เอ จำกัด ', 4),
      ],
    );

    expect(result.bidderCount).toBe(4);
  });

  test('the same name in two projects is never linked: each project is counted on its own', () => {
    const one = digest([line()], [bid(A, 1), bid(B, 2)]);
    const two = digest([line()], [bid(A, 1), bid(C, 2), bid(B, 3)]);

    expect([one.bidderCount, two.bidderCount]).toEqual([2, 3]);
    expect(Object.keys(one).some((key) => /compan|merchant|bidders?Names/i.test(key))).toBe(false);
  });

  test('a joint venture\u2019s members are not bidders unless they bid under their own names', () => {
    const result = digest(
      [
        line({ contractNo: 'JV', winnerName: CONSORTIUM, priceAgree: 10 }),
        line({ contractNo: 'JV', winnerName: A, priceAgree: 0 }),
        line({ contractNo: 'JV', winnerName: B, priceAgree: 0 }),
      ],
      [bid(CONSORTIUM, 10), bid(C, 20)],
    );

    expect(result.bidderCount).toBe(2);
  });

  test('nothing in a digest says a bidder was disqualified, since the data has no status', () => {
    const result = digest([line()], [bid(A, 1), bid(B, 2)]);

    expect(Object.keys(result).some((key) => /disqualif|^tin$|Tin$/i.test(key))).toBe(false);
    // The only status a digest has is about the winner, never about a bidder.
    expect(Object.keys(result).filter((key) => /status/i.test(key))).toEqual(['winnerStatus']);
  });

  test('the minimum sample is reported as provisional, like the boundary', () => {
    const result = competitionLevel([]);

    expect(result.minSampleProvisional).toBe(true);
    expect(result.thresholds.provisional).toBe(true);
  });

  test('a bids-only project has no usable count and is left out of the level', () => {
    const bidsOnly = digest([], [bid(A, 1), bid(B, 2)]);

    expect(bidsOnly).toMatchObject({ hasContractData: false, bidderCount: null });
    expect(competitionLevel([bidsOnly]).withKnownBidderCount).toBe(0);
  });

  test('bids of a year with no contract line are reported as their own reason, not as zero', () => {
    const known = digestsWithCounts([2, 2, 2, 2]);
    const stray = digest([line({ contractYear: 2569 })], [bid(A, 1, 1, 2568), bid(B, 2, 1, 2568)]);

    const result = competitionLevel([...known, stray]);

    expect(result.unknownBidderCounts.year_without_contract).toBe(1);
    expect(result.withKnownBidderCount).toBe(4);
    expect(result.level).toBeNull();
  });

  test('a project passed twice is one comparable, and the duplicate is reported', () => {
    const [one] = digestsWithCounts([2]);

    const result = competitionLevel([one!, one!, one!, one!, one!]);

    expect(result).toMatchObject({ comparables: 1, duplicatesIgnored: 4, withKnownBidderCount: 1 });
    expect(result.level).toBeNull();
  });
});

describe('closestAwardDigests: the ten nearest budgets, by compareBudget', () => {
  // Past awards (contract data) with a planned budget in baht, one per budget given.
  const awards = (budgets: (number | null)[], overrides: Partial<CompetitionProject> = {}) =>
    budgets.map((budget, index) =>
      digestAward(
        project({ projectId: `a${index + 1}`, budget, ...overrides }),
        summariseAward([line({ projectId: `a${index + 1}` })], [bid(A, 10), bid(B, 20)]),
      ),
    );

  test('lists the smallest absolute budget difference first, above and below alike', () => {
    const result = closestAwardDigests(1_000, awards([1_400, 900, 1_050, 700, 1_300, 2_000]));

    expect(result.listed.map((entry) => entry.digest.project.projectId)).toEqual([
      'a3',
      'a2',
      'a4',
      'a5',
      'a1',
      'a6',
    ]);
    expect(result.listed.map((entry) => entry.difference)).toEqual([
      50, -100, -300, 300, 400, 1_000,
    ]);
  });

  test('is exactly compareBudget\u2019s order, cap and tie-breaks, not a copy that could drift', () => {
    const digests = awards(
      Array.from({ length: 14 }, (_, i) => 1_000 + ((i % 5) - 2) * 100),
      {},
    ).map((digest, i) => ({
      ...digest,
      project: {
        ...digest.project,
        announceDate: i % 3 === 0 ? null : `2026-0${(i % 3) + 1}-01T00:00:00.000Z`,
      },
    }));
    const expected = compareBudget(
      1_000,
      digests.map(({ project }) => ({ ...project, budget: project.budget! })),
    );

    const result = closestAwardDigests(1_000, digests);

    expect(result.listed.map((entry) => entry.digest.project.projectId)).toEqual(
      expected.projects.map((comparable) => comparable.projectId),
    );
    expect(result.listed.map((entry) => entry.difference)).toEqual(
      expected.projects.map((comparable) => comparable.difference),
    );
    expect(result.count).toBe(expected.count);
  });

  test('lists at most ten, and counts all of them', () => {
    const result = closestAwardDigests(
      100,
      awards(Array.from({ length: 12 }, (_, i) => 100 * (i + 1))),
    );

    expect(BUDGET_COMPARISON_MAX_PROJECTS).toBe(10);
    expect(result.count).toBe(12);
    expect(result.listed).toHaveLength(10);
    expect(result.listed.map((entry) => entry.digest.project.budget)).toEqual([
      100, 200, 300, 400, 500, 600, 700, 800, 900, 1_000,
    ]);
  });

  test('a tie goes to the later announcement, then to the lower project id', () => {
    const digests = [
      { id: 'b', budget: 1_100, announced: '2026-02-01T00:00:00.000Z' },
      { id: 'a', budget: 900, announced: '2026-03-01T00:00:00.000Z' },
      { id: 'c', budget: 1_100, announced: '2026-03-01T00:00:00.000Z' },
      { id: 'd', budget: 900, announced: null },
    ].map(({ id, budget, announced }) =>
      digestAward(
        project({ projectId: id, budget, announceDate: announced }),
        summariseAward([line({ projectId: id })], [bid(A, 1)]),
      ),
    );

    const result = closestAwardDigests(1_000, digests);

    expect(result.listed.map((entry) => entry.digest.project.projectId)).toEqual([
      'a',
      'c',
      'b',
      'd',
    ]);
  });

  test('only past awards are listed: a project with no contract data is not', () => {
    const noContract = digestAward(
      project({ projectId: 'none', budget: 1_000 }),
      summariseAward([], [bid(A, 1), bid(B, 2)]),
    );

    const result = closestAwardDigests(1_000, [...awards([900]), noContract]);

    expect(result.listed.map((entry) => entry.digest.project.projectId)).toEqual(['a1']);
    expect(result.count).toBe(1);
  });

  test('a past award with no planned budget cannot be ordered: it is left out and counted', () => {
    const result = closestAwardDigests(1_000, awards([900, null, 1_200, null]));

    expect(result.listed.map((entry) => entry.digest.project.projectId)).toEqual(['a1', 'a3']);
    expect(result).toMatchObject({ count: 2, withoutBudget: 2, noOwnBudget: false });
  });

  test('a TOR with no planned budget lists nothing, and says so', () => {
    const result = closestAwardDigests(null, awards([900, 1_200]));

    expect(result).toMatchObject({ listed: [], noOwnBudget: true, count: 2, withoutBudget: 0 });
  });

  test('no past awards is an empty list', () => {
    expect(closestAwardDigests(1_000, [])).toEqual({
      count: 0,
      withoutBudget: 0,
      noOwnBudget: false,
      duplicatesIgnored: 0,
      listed: [],
    });
  });

  test('a project passed twice is listed once', () => {
    const [one] = awards([900]);

    const result = closestAwardDigests(1_000, [one!, one!]);

    expect(result.listed).toHaveLength(1);
    expect(result.count).toBe(1);
  });

  test('the digests handed back are the ones given, with their award facts, and are not changed', () => {
    const given = awards([900, 1_100]);
    const before = JSON.stringify(given);

    const result = closestAwardDigests(1_000, given);

    expect(JSON.stringify(given)).toBe(before);
    expect(result.listed[0]!.digest).toBe(given[0]!);
    expect(result.listed[0]!.digest).toMatchObject({
      bidderCount: 2,
      winners: [{ name: A, jointVenture: false }],
      clean: true,
    });
  });
});

describe('a winner with no published name is no determined winner (M1)', () => {
  test('a single contract with no winner name is not determined, not clean, and gives no price figure', () => {
    const result = digest([line({ winnerName: null })], [bid(A, 10), bid(B, 20)]);

    expect(result).toMatchObject({
      hasContractData: true,
      winnerStatus: 'not_determined',
      winners: [],
      undeterminedAwards: 1,
      clean: false,
      prices: null,
    });
  });

  test('its bidder count still counts toward the level, as for any award whose winner is not determined', () => {
    const known = digestsWithCounts([2, 2, 2, 2]);
    const unnamed = digest(
      [line({ winnerName: null })],
      [bid(A, 1), bid(B, 2), bid(C, 3), bid('บริษัท ดี จำกัด', 4)],
    );

    const result = competitionLevel([...known, unnamed]);

    expect(unnamed.bidderCount).toBe(4);
    expect(result).toMatchObject({
      withKnownBidderCount: 5,
      withResolvedWinner: 4,
      clean: 4,
    });
  });

  test('a joint venture whose consortium line has no name cannot be recognised, and is not determined', () => {
    const result = digest(
      [
        line({ contractNo: 'JV', winnerName: null, priceAgree: 10 }),
        line({ contractNo: 'JV', winnerName: A, priceAgree: 0 }),
      ],
      [bid(A, 1), bid(B, 2)],
    );

    expect(result.winnerStatus).toBe('not_determined');
    expect(result.winners).toEqual([]);
    expect(result.clean).toBe(false);
    expect(result.prices).toBeNull();
  });

  test('a project with a named winner and one unnamed contract is not determined, and lists only the named', () => {
    const result = digest(
      [line({ contractNo: 'C-1', winnerName: A }), line({ contractNo: 'C-2', winnerName: null })],
      [bid(A, 1), bid(B, 2)],
    );

    expect(result.winnerStatus).toBe('not_determined');
    expect(result.winners.map((winner) => winner.name)).toEqual([A]);
    expect(result.undeterminedAwards).toBe(1);
    expect(result.clean).toBe(false);
  });

  test('a named winner is still resolved and clean, as before', () => {
    const result = digest([line({ winnerName: A })], [bid(A, 1), bid(B, 2)]);

    expect(result).toMatchObject({ winnerStatus: 'resolved', clean: true, undeterminedAwards: 0 });
    expect(result.winners).toEqual([{ name: A, jointVenture: false }]);
  });
});

describe('an agreed price of 0 or less is flagged, never turned into a ratio (M2)', () => {
  test.each([0, -1, -2_830_000])(
    'a published price of %p is kept, flagged and gives no ratio',
    (price) => {
      const result = digest([line({ priceAgree: price })], [bid(A, 5), bid(B, 7)]);

      expect(result.clean).toBe(true);
      expect(result.prices).toMatchObject({
        agreedPrice: price,
        agreedPriceUnusable: true,
        agreedToBudget: null,
        exceedsBudget: false,
      });
    },
  );

  test('the average bid is unaffected by an unusable agreed price', () => {
    const result = digest([line({ priceAgree: 0 })], [bid(A, 10), bid(B, 30)]);

    expect(result.prices).toMatchObject({ averageBid: 20, pricedBids: 2 });
  });

  test('a positive price is usable, and an unpublished price is not flagged', () => {
    expect(digest([line({ priceAgree: 100 })], [bid(A, 1)], 1_000).prices).toMatchObject({
      agreedPriceUnusable: false,
      agreedToBudget: 0.1,
    });
    expect(digest([line({ priceAgree: null })], [bid(A, 1)]).prices).toMatchObject({
      agreedPrice: null,
      agreedPriceUnusable: false,
      agreedToBudget: null,
    });
  });

  test('a zero price in a joint venture\u2019s member line is not the contract\u2019s price', () => {
    const result = digest(
      [
        line({ contractNo: 'JV', winnerName: CONSORTIUM, priceAgree: 49_450_000 }),
        line({ contractNo: 'JV', winnerName: A, priceAgree: 0 }),
      ],
      [bid(CONSORTIUM, 1), bid(B, 2)],
      50_000_000,
    );

    expect(result.prices).toMatchObject({ agreedPrice: 49_450_000, agreedPriceUnusable: false });
  });
});

describe('the provisional default threshold cannot be changed from outside (L1)', () => {
  test('the default is frozen, and writing to it fails', () => {
    expect(Object.isFrozen(DEFAULT_COMPETITION_THRESHOLDS)).toBe(true);
    expect(() => {
      (DEFAULT_COMPETITION_THRESHOLDS as { fewMax: number }).fewMax = 99;
    }).toThrow(TypeError);
  });

  test('after an attempt to change it the default is still 3', () => {
    try {
      (DEFAULT_COMPETITION_THRESHOLDS as { fewMax: number }).fewMax = 99;
    } catch {
      // The write is refused; what matters is the value that is used next.
    }

    expect(DEFAULT_COMPETITION_THRESHOLDS.fewMax).toBe(3);
    expect(competitionLevel([]).thresholds.fewMax).toBe(3);
  });

  test('the threshold a result reports is its own object, not the shared default', () => {
    const result = competitionLevel([]);

    expect(result.thresholds).not.toBe(DEFAULT_COMPETITION_THRESHOLDS);
    expect(competitionLevel([]).thresholds.fewMax).toBe(3);
  });
});

describe('closestAwardDigests reports duplicates, however the first one reads (L2)', () => {
  const past = (id: string, budget = 900) =>
    digestAward(
      project({ projectId: id, budget }),
      summariseAward([line({ projectId: id })], [bid(A, 1), bid(B, 2)]),
    );
  const noContract = (id: string) =>
    digestAward(
      project({ projectId: id, budget: 900 }),
      summariseAward([], [bid(A, 1), bid(B, 2)]),
    );

  test('a project given three times is listed once and two duplicates are reported', () => {
    const one = past('a');

    const result = closestAwardDigests(1_000, [one, one, one]);

    expect(result.listed).toHaveLength(1);
    expect(result.duplicatesIgnored).toBe(2);
  });

  test('no duplicates is a count of zero', () => {
    expect(closestAwardDigests(1_000, [past('a'), past('b')]).duplicatesIgnored).toBe(0);
  });

  test('when the first digest of a project has no contract data it is the one kept, and the loss is reported', () => {
    const result = closestAwardDigests(1_000, [noContract('x'), past('x')]);

    expect(result.listed).toEqual([]);
    expect(result.count).toBe(0);
    expect(result.duplicatesIgnored).toBe(1);
  });

  test('duplicates are reported even when this TOR has no budget', () => {
    const one = past('a');

    expect(closestAwardDigests(null, [one, one])).toMatchObject({
      noOwnBudget: true,
      listed: [],
      duplicatesIgnored: 1,
    });
  });

  test('duplicates are reported when nothing is listed because the first has no contract data', () => {
    expect(closestAwardDigests(1_000, [noContract('x'), noContract('x')]).duplicatesIgnored).toBe(
      1,
    );
  });
});

describe('a budget that is not a finite number is no budget (L3)', () => {
  const awardWith = (id: string, budget: number | null) =>
    digestAward(
      project({ projectId: id, budget }),
      summariseAward([line({ projectId: id })], [bid(A, 1), bid(B, 2)]),
    );

  test.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    'a comparable with a budget of %p is left out of the listing and counted as without a budget',
    (budget) => {
      const result = closestAwardDigests(250, [
        awardWith('a', 100),
        awardWith('bad', budget),
        awardWith('c', 300),
      ]);

      expect(result.listed.map((entry) => entry.digest.project.projectId)).toEqual(['c', 'a']);
      expect(result).toMatchObject({ count: 2, withoutBudget: 1 });
      expect(result.listed.every((entry) => Number.isFinite(entry.difference))).toBe(true);
    },
  );

  test.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    'a TOR whose own budget is %p lists nothing, like one with no budget',
    (own) => {
      const result = closestAwardDigests(own, [awardWith('a', 100), awardWith('b', 300)]);

      expect(result).toMatchObject({ listed: [], noOwnBudget: true, count: 2 });
    },
  );

  test('a non-finite planned budget gives no agreed-price ratio', () => {
    for (const budget of [Number.NaN, Number.POSITIVE_INFINITY]) {
      const result = digestAward(
        project({ budget }),
        summariseAward([line({ priceAgree: 100 })], [bid(A, 1), bid(B, 2)]),
      );

      expect(result.prices).toMatchObject({ agreedPrice: 100, agreedToBudget: null });
    }
  });

  test('finite budgets, including zero, still list as before', () => {
    const result = closestAwardDigests(0, [awardWith('a', 0), awardWith('b', 100)]);

    expect(result.listed.map((entry) => entry.difference)).toEqual([0, 100]);
    expect(result.withoutBudget).toBe(0);
  });
});

describe('blank names are missing names, and a non-finite agreed price is unusable', () => {
  test.each(['', '   ', '\t\n'])(
    'a winner named %p is not determined, not clean, and gives no price figure',
    (blank) => {
      const result = digest([line({ winnerName: blank })], [bid(A, 10), bid(B, 20)]);

      expect(result).toMatchObject({
        winnerStatus: 'not_determined',
        winners: [],
        undeterminedAwards: 1,
        clean: false,
        prices: null,
      });
    },
  );

  test('such an award still counts its bidder count toward the level, and is not a resolved winner', () => {
    const known = digestsWithCounts([2, 2, 2, 2]);
    const blank = digest([line({ winnerName: '  ' })], [bid(A, 1), bid(B, 2), bid(C, 3)]);

    const result = competitionLevel([...known, blank]);

    expect(result).toMatchObject({ withKnownBidderCount: 5, withResolvedWinner: 4, clean: 4 });
  });

  test('a blank winner name never reads as a winner called nothing', () => {
    const result = digest(
      [line({ contractNo: 'C-1', winnerName: A }), line({ contractNo: 'C-2', winnerName: ' ' })],
      [bid(A, 1), bid(B, 2)],
    );

    expect(result.winners.map((winner) => winner.name)).toEqual([A]);
    expect(result.winnerStatus).toBe('not_determined');
  });

  test.each(['', '   ', '\t'])(
    'a bidder named %p makes the count unknown, never a count that includes a nameless bidder',
    (blank) => {
      const result = digest([line()], [bid(A, 1), bid(blank, 2), bid(B, 3)]);

      expect(result).toMatchObject({
        bidderCount: null,
        bidderCountGap: 'unnamed_bidder',
        clean: false,
        prices: null,
      });
    },
  );

  test('a blank bidder keeps its project out of the level, and is reported as unnamed', () => {
    const known = digestsWithCounts([2, 2, 2, 2]);
    const blank = digest([line()], [bid(A, 1), bid('', 2), bid(B, 3)]);

    const result = competitionLevel([...known, blank]);

    expect(result.withKnownBidderCount).toBe(4);
    expect(result.unknownBidderCounts.unnamed_bidder).toBe(1);
    expect(result.level).toBeNull();
  });

  test('names are not trimmed or matched: a trailing space is a different bidder', () => {
    const result = digest([line()], [bid(A, 1), bid(`${A} `, 2)]);

    expect(result.bidderCount).toBe(2);
  });

  test('a named winner is still resolved and clean', () => {
    const result = digest([line({ winnerName: A })], [bid(A, 1), bid(B, 2)]);

    expect(result).toMatchObject({ winnerStatus: 'resolved', clean: true });
  });

  test.each([
    ['Infinity', Number.POSITIVE_INFINITY],
    ['-Infinity', Number.NEGATIVE_INFINITY],
    ['NaN', Number.NaN],
  ])('an agreed price of %s is flagged unusable and gives no ratio', (_label, price) => {
    const result = digest([line({ priceAgree: price })], [bid(A, 5), bid(B, 7)]);

    expect(result.clean).toBe(true);
    expect(result.prices).toMatchObject({
      agreedPriceUnusable: true,
      agreedToBudget: null,
      exceedsBudget: false,
    });
  });

  test('a large finite price is usable, and may exceed the budget as before', () => {
    const result = digest([line({ priceAgree: 1e12 })], [bid(A, 5), bid(B, 7)], 1_000);

    expect(result.prices).toMatchObject({ agreedPriceUnusable: false, exceedsBudget: true });
    expect(result.prices!.agreedToBudget).toBe(1e9);
  });
});

describe('a summary built elsewhere with a blank winner name is read as having no winner', () => {
  // `summariseAward` already turns a blank name into a missing one; `digestAward` does not rely on that.
  const withWinnerName = (name: string) => {
    const summary = summariseAward([line({ winnerName: A })], [bid(A, 1), bid(B, 2)]);
    return digestAward(project({ projectId: 'built' }), {
      ...summary,
      awards: summary.awards.map((entry) => ({ ...entry, winnerName: name })),
    });
  };

  test.each(['', '   ', '\t\n'])('a winner name of %p is no determined winner', (blank) => {
    const result = withWinnerName(blank);

    expect(result).toMatchObject({
      winnerStatus: 'not_determined',
      winners: [],
      undeterminedAwards: 1,
      clean: false,
      prices: null,
    });
  });

  test('a real name in the same shape is still a winner', () => {
    expect(withWinnerName(A)).toMatchObject({
      winnerStatus: 'resolved',
      winners: [{ name: A, jointVenture: false }],
      clean: true,
    });
  });
});

describe('repeatWinners: a name that wins again among the given awards', () => {
  const won = (name: string, id: string) =>
    digestAward(
      project({ projectId: id }),
      summariseAward([line({ projectId: id, winnerName: name })], []),
    );

  test('counts a name once per project and keeps only names that won at least twice', () => {
    const result = repeatWinners([
      won(A, 'p1'),
      won(A, 'p2'),
      won(A, 'p3'),
      won(B, 'p4'),
      won(B, 'p5'),
      won(C, 'p6'),
    ]);
    expect(result).toEqual({
      projects: 6,
      winners: [
        { name: A, wins: 3 },
        { name: B, wins: 2 },
      ],
    });
  });

  test('is null where every winner won once', () => {
    expect(repeatWinners([won(A, 'p1'), won(B, 'p2'), won(C, 'p3')])).toBeNull();
    expect(repeatWinners([])).toBeNull();
  });

  test('a project given twice counts once, so it cannot make a repeat by itself', () => {
    expect(repeatWinners([won(A, 'p1'), won(A, 'p1')])).toBeNull();
  });

  test('names are exact: a different spelling is a different winner', () => {
    expect(repeatWinners([won(A, 'p1'), won(`${A} `, 'p2')])).toBeNull();
  });

  test('an award whose winner is not determined is neither counted nor in the total', () => {
    const undetermined = digestAward(project({ projectId: 'u1' }), summariseAward([], []));
    const result = repeatWinners([won(A, 'p1'), won(A, 'p2'), undetermined]);
    expect(result?.projects).toBe(2);
  });

  test('reports at most three, most wins first, ties by name', () => {
    const names = ['บริษัท ง จำกัด', 'บริษัท ค จำกัด', 'บริษัท ข จำกัด', 'บริษัท ก จำกัด'];
    const digests = names.flatMap((name, index) => [
      won(name, `a${index}`),
      won(name, `b${index}`),
    ]);
    const result = repeatWinners(digests);
    expect(result?.winners.map((winner) => winner.name)).toEqual([
      'บริษัท ก จำกัด',
      'บริษัท ข จำกัด',
      'บริษัท ค จำกัด',
    ]);
  });
});
