import { render, screen, within } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import { summariseAward, type Contract, type ContractSubmission } from '@torfun/types';

import { TorAwardSummary } from './tor-award-summary';

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
const NO_CONTRACT_YEAR_NOTE =
  'ข้อมูลผู้เสนอราคาเป็นของปีงบประมาณที่โครงการนี้ไม่มีรายการสัญญา จึงไม่นับเป็นผู้เสนอราคาของสัญญา';
const UNCONFIRMED = 'จำนวนเงินในรายการนี้ (ตามที่เผยแพร่ ยังไม่ยืนยันว่าเป็นราคาของผู้ชนะ)';

describe('TorAwardSummary', () => {
  test('says there is no award data, and claims nothing, when there is none', () => {
    render(<TorAwardSummary award={null} />);

    expect(screen.getByText('ยังไม่มีข้อมูลผู้ชนะและราคา')).toBeInTheDocument();
    expect(screen.queryByText(/ระบบไม่ได้ยืนยัน/)).not.toBeInTheDocument();
  });

  test('shows a winner with the agreed price and the submitted bid as two separate figures', () => {
    render(
      <TorAwardSummary
        award={summariseAward(
          [line()],
          [bid('บริษัท บี จำกัด', 1_890_000), bid(A, 2_850_000), bid('บริษัท ซี จำกัด', 2_098_270)],
        )}
      />,
    );

    expect(screen.getByText('ผู้ชนะและราคาของโครงการนี้')).toBeInTheDocument();
    expect(screen.getByText(/ปีงบประมาณที่ทำสัญญา 2569/)).toBeInTheDocument();
    expect(screen.getByText(/ระบบไม่ได้ยืนยันความถูกต้อง/)).toBeInTheDocument();
    expect(screen.getByText(/โปรดตรวจสอบกับเอกสารต้นฉบับ/)).toBeInTheDocument();
    expect(screen.getByText('ราคาที่ตกลงตามสัญญา').nextElementSibling).toHaveTextContent(
      '2,830,000 บาท',
    );
    expect(
      screen.getByText('ราคาที่ผู้ชนะยื่น (จับคู่จากชื่อ)').nextElementSibling,
    ).toHaveTextContent('2,850,000 บาท');
    expect(screen.getByText('มีผู้เสนอราคาต่ำกว่าผู้ชนะ 2 ราย')).toBeInTheDocument();
    expect(
      screen.getByText('ราคาที่ยื่นกับราคาที่ตกลงตามสัญญาเป็นคนละตัวเลข และอาจต่างกันได้'),
    ).toBeInTheDocument();
  });

  test('lists the bids cheapest first with their range, the winner marked, and the bidder count', () => {
    render(
      <TorAwardSummary
        award={summariseAward(
          [line()],
          [bid('บริษัท บี จำกัด', 1_890_000), bid(A, 2_850_000), bid('บริษัท ซี จำกัด', 2_098_270)],
        )}
      />,
    );

    expect(screen.getByText('ผู้เสนอราคา 3 ราย')).toBeInTheDocument();
    expect(screen.getByText('ผู้ชนะ')).toBeInTheDocument();
    expect(
      screen.getByText(/ต่ำสุด 1,890,000 บาท · เฉลี่ย 2,279,423.33 บาท · สูงสุด 2,850,000 บาท/),
    ).toBeInTheDocument();
    const bids = screen
      .getByRole('heading', { name: 'ราคาที่ผู้เสนอราคายื่น' })
      .closest('section') as HTMLElement;
    const rows = within(bids)
      .getAllByRole('listitem')
      .map((item) => item.textContent ?? '');
    expect(rows).toHaveLength(3);
    expect(rows[0]).toContain('1,890,000');
    expect(rows[1]).toContain('2,098,270');
    expect(rows[2]).toContain('2,850,000');
  });

  test('shows the budget, the reference price and the published aggregate, each labelled', () => {
    render(<TorAwardSummary award={summariseAward([line()], [])} />);

    expect(screen.getByText('วงเงินงบประมาณ').nextElementSibling).toHaveTextContent(
      '3,000,000 บาท',
    );
    expect(screen.getByText('ราคากลาง').nextElementSibling).toHaveTextContent('2,990,000 บาท');
    expect(screen.getByText('ราคาที่ตกลงรวม (ตามที่เผยแพร่)').nextElementSibling).toHaveTextContent(
      '2,830,000 บาท',
    );
  });

  test('a joint venture shows the consortium as the winner and its members apart', () => {
    render(
      <TorAwardSummary
        award={summariseAward(
          [
            line({
              contractNo: 'JV-1',
              winnerName: 'กิจการค้าร่วม เอ็นบี',
              priceAgree: 49_450_000,
            }),
            line({
              contractNo: 'JV-1',
              winnerName: 'บริษัทจำกัด บริษัท ก',
              priceAgree: 49_450_000,
            }),
            line({ contractNo: 'JV-1', winnerName: 'บริษัทจำกัด บริษัท ข', priceAgree: 0 }),
          ],
          [],
        )}
      />,
    );

    expect(screen.getByText('กิจการค้าร่วม เอ็นบี')).toBeInTheDocument();
    expect(screen.getByText('กิจการค้าร่วม')).toBeInTheDocument();
    expect(
      screen.getByText('สมาชิก: บริษัทจำกัด บริษัท ก, บริษัทจำกัด บริษัท ข'),
    ).toBeInTheDocument();
    expect(screen.getAllByText('49,450,000 บาท')).toHaveLength(1);
  });

  test('an unresolved award says so and shows the lines as published, naming no winner', () => {
    render(
      <TorAwardSummary
        award={summariseAward(
          [
            line({
              contractNo: 'JV-2',
              winnerName: 'บีทามส์และเน็กซ์พิกเซล',
              priceAgree: 43_500_000,
            }),
            line({ contractNo: 'JV-2', winnerName: 'บริษัทจำกัด บริษัท ก', priceAgree: 0 }),
          ],
          [bid('บีทามส์และเน็กซ์พิกเซล', 43_500_000)],
        )}
      />,
    );

    expect(screen.getByText('ยังระบุผู้ชนะไม่ได้')).toBeInTheDocument();
    // Once as a contract line, once as a bidder: both are published as they are.
    expect(screen.getAllByText('บีทามส์และเน็กซ์พิกเซล')).toHaveLength(2);
    expect(screen.getByText(/แสดงตามที่เผยแพร่/)).toBeInTheDocument();
    expect(screen.queryByText('ผู้ชนะ')).not.toBeInTheDocument();
    expect(screen.queryByText(/จับคู่จากชื่อ/)).not.toBeInTheDocument();
  });

  test('several items show each with its own bids, and no winner bid is guessed', () => {
    render(
      <TorAwardSummary
        award={summariseAward(
          [
            line({ contractNo: 'C-1', winnerName: A, priceAgree: 100 }),
            line({ contractNo: 'C-2', winnerName: 'บริษัท บี จำกัด', priceAgree: 200 }),
          ],
          [
            bid(A, 90, 1, 'ลูกถ้วย ก'),
            bid('บริษัท บี จำกัด', 95, 1, 'ลูกถ้วย ก'),
            bid('บริษัท บี จำกัด', 190, 2, 'ลูกถ้วย ข'),
          ],
        )}
      />,
    );

    expect(screen.getByText('รายการที่ 1 · ลูกถ้วย ก')).toBeInTheDocument();
    expect(screen.getByText('รายการที่ 2 · ลูกถ้วย ข')).toBeInTheDocument();
    expect(screen.getAllByText(/โครงการมีหลายรายการ/)).toHaveLength(2);
    expect(screen.queryByText('ผู้ชนะ')).not.toBeInTheDocument();
    expect(screen.queryByText('ราคาที่ผู้ชนะยื่น (จับคู่จากชื่อ)')).not.toBeInTheDocument();
  });

  test('a contract with no bids says so, and an unnamed bid makes the count unknown', () => {
    const { unmount } = render(<TorAwardSummary award={summariseAward([line()], [])} />);
    expect(screen.getByText('ไม่พบข้อมูลผู้เสนอราคา')).toBeInTheDocument();
    unmount();

    render(<TorAwardSummary award={summariseAward([line()], [bid(null, 100), bid(A, 90)])} />);
    expect(screen.getByText('ไม่ทราบจำนวนผู้เสนอราคาที่แน่ชัด')).toBeInTheDocument();
  });

  test('bids with no contract are shown, with the missing contract said plainly', () => {
    render(<TorAwardSummary award={summariseAward([], [bid(A, 100)])} />);

    expect(screen.getByText('ไม่พบข้อมูลสัญญาของโครงการนี้')).toBeInTheDocument();
    // The bids' year has no contract line, so no count is given as the award's.
    expect(screen.queryByText('ผู้เสนอราคา 1 ราย')).not.toBeInTheDocument();
    expect(screen.getByText('ไม่ทราบจำนวนผู้เสนอราคาที่แน่ชัด')).toBeInTheDocument();
    expect(screen.getByText(NO_CONTRACT_YEAR_NOTE)).toBeInTheDocument();
  });

  test('bids of a year the project has no contract line for are not counted, and the page says why', () => {
    render(
      <TorAwardSummary
        award={summariseAward(
          [line({ contractYear: 2569, winnerName: A })],
          [
            { ...bid(A, 100), contractYear: 2568 },
            { ...bid('บริษัท บี จำกัด', 90), contractYear: 2568 },
          ],
        )}
      />,
    );

    expect(screen.queryByText(/^ผู้เสนอราคา \d+ ราย$/)).not.toBeInTheDocument();
    expect(screen.getByText(NO_CONTRACT_YEAR_NOTE)).toBeInTheDocument();
    expect(
      screen.getByText(
        'ไม่แสดงราคาที่ผู้ชนะยื่น เพราะข้อมูลผู้เสนอราคาที่เก็บไว้เป็นของปีงบประมาณอื่น ไม่ใช่ปีของสัญญานี้',
      ),
    ).toBeInTheDocument();
  });

  test('bids of the contract’s own year are counted and carry no such note', () => {
    render(
      <TorAwardSummary
        award={summariseAward([line({ winnerName: A })], [bid(A, 100), bid('บริษัท บี จำกัด', 90)])}
      />,
    );

    expect(screen.getByText('ผู้เสนอราคา 2 ราย')).toBeInTheDocument();
    expect(screen.queryByText(NO_CONTRACT_YEAR_NOTE)).not.toBeInTheDocument();
  });

  test('a price that was not published is not shown as zero', () => {
    render(
      <TorAwardSummary
        award={summariseAward(
          [line({ priceAgree: null })],
          [bid(A, null), bid('บริษัท บี จำกัด', 50)],
        )}
      />,
    );

    expect(screen.queryByText('0 บาท')).not.toBeInTheDocument();
    expect(screen.getAllByText('ไม่ระบุ').length).toBeGreaterThan(0);
  });

  describe('each contract line shows its own contract year', () => {
    test('a single contract shows its year, and the header says it when every line shares it', () => {
      render(<TorAwardSummary award={summariseAward([line({ contractNo: 'CN-1' })], [])} />);

      expect(screen.getByText('ทำสัญญาปีงบประมาณ 2569')).toBeInTheDocument();
      expect(screen.getByText(/ปีงบประมาณที่ทำสัญญา 2569/)).toBeInTheDocument();
      expect(screen.queryByText(/พบสัญญาหลายปีงบประมาณ/)).not.toBeInTheDocument();
    });

    test('contracts of several years each show their own, and the header says there are several', () => {
      render(
        <TorAwardSummary
          award={summariseAward(
            [
              line({ contractNo: 'OLD', contractYear: 2568, winnerName: 'บริษัท ก จำกัด' }),
              line({ contractNo: 'NEW', contractYear: 2569, winnerName: 'บริษัท ข จำกัด' }),
            ],
            [],
          )}
        />,
      );

      const entries = screen.getAllByRole('listitem');
      const old = entries.find((entry) => entry.textContent?.includes('บริษัท ก จำกัด'))!;
      const current = entries.find((entry) => entry.textContent?.includes('บริษัท ข จำกัด'))!;
      expect(within(old).getByText('ทำสัญญาปีงบประมาณ 2568')).toBeInTheDocument();
      expect(within(old).queryByText('ทำสัญญาปีงบประมาณ 2569')).not.toBeInTheDocument();
      expect(within(current).getByText('ทำสัญญาปีงบประมาณ 2569')).toBeInTheDocument();
      expect(screen.getByText(/พบสัญญาหลายปีงบประมาณภายใต้เลขโครงการนี้/)).toBeInTheDocument();
      expect(screen.queryByText(/ปีงบประมาณที่ทำสัญญา 25/)).not.toBeInTheDocument();
    });

    test('the year is the published contract year, never read from a contract date', () => {
      render(
        <TorAwardSummary
          award={summariseAward(
            [line({ contractYear: 2569, contractDate: '1 ม.ค. 68', contractFinishDate: '-' })],
            [],
          )}
        />,
      );

      expect(screen.getByText('ทำสัญญาปีงบประมาณ 2569')).toBeInTheDocument();
      expect(screen.queryByText(/2568/)).not.toBeInTheDocument();
    });

    test('a joint venture shows its year, and its members are not annotated with a year of their own', () => {
      render(
        <TorAwardSummary
          award={summariseAward(
            [
              line({ contractNo: 'JV-1', winnerName: 'กิจการค้าร่วม เอ็นบี', contractYear: 2569 }),
              line({ contractNo: 'JV-1', winnerName: 'บริษัท ก จำกัด', contractYear: 2569 }),
              line({ contractNo: 'JV-1', winnerName: 'บริษัท ข จำกัด', contractYear: 2569 }),
            ],
            [],
          )}
        />,
      );

      expect(screen.getAllByText('ทำสัญญาปีงบประมาณ 2569')).toHaveLength(1);
      expect(screen.getByText('สมาชิก: บริษัท ก จำกัด, บริษัท ข จำกัด')).toBeInTheDocument();
    });

    test('the same contract number in two years is two unresolved awards, each with its own year and no winner', () => {
      render(
        <TorAwardSummary
          award={summariseAward(
            [
              line({ contractNo: 'JV-1', winnerName: 'กิจการค้าร่วม เอ็นบี', contractYear: 2569 }),
              line({ contractNo: 'JV-1', winnerName: 'บริษัท ก จำกัด', contractYear: 2568 }),
            ],
            [],
          )}
        />,
      );

      expect(screen.getAllByText('ยังระบุผู้ชนะไม่ได้')).toHaveLength(2);
      expect(screen.getAllByText(/เลขที่สัญญานี้ปรากฏในปีงบประมาณอื่นด้วย/)).toHaveLength(2);
      expect(screen.getAllByText(UNCONFIRMED)).toHaveLength(2);
      expect(screen.getByText('ทำสัญญาปีงบประมาณ 2569')).toBeInTheDocument();
      expect(screen.getByText('ทำสัญญาปีงบประมาณ 2568')).toBeInTheDocument();
      expect(screen.queryByText(/สมาชิก:/)).not.toBeInTheDocument();
      expect(screen.queryByText('กิจการค้าร่วม')).not.toBeInTheDocument();
      expect(screen.queryByText('ราคาที่ตกลงตามสัญญา')).not.toBeInTheDocument();
    });

    test('a zero-price member of another year is not shown as an independent winner', () => {
      render(
        <TorAwardSummary
          award={summariseAward(
            [
              line({
                contractNo: 'JV-1',
                winnerName: 'กิจการค้าร่วม เอ็นบี',
                contractYear: 2569,
                priceAgree: 49_450_000,
              }),
              line({
                contractNo: 'JV-1',
                winnerName: 'บริษัท ก จำกัด',
                contractYear: 2568,
                priceAgree: 0,
              }),
            ],
            [],
          )}
        />,
      );

      // Both lines are listed as published, under "winner not determined", and neither is a winner.
      expect(screen.getAllByText('ยังระบุผู้ชนะไม่ได้')).toHaveLength(2);
      expect(screen.queryByText('ผู้ชนะ')).not.toBeInTheDocument();
      expect(screen.queryByText('ราคาที่ตกลงตามสัญญา')).not.toBeInTheDocument();
      expect(screen.queryByText(/จับคู่จากชื่อ/)).not.toBeInTheDocument();
      expect(screen.getByText('0 บาท')).toBeInTheDocument();
      expect(screen.getByText('49,450,000 บาท')).toBeInTheDocument();
      // Each published amount carries the label right beside it, so neither reads as a winner's price.
      expect(screen.getByText('0 บาท').parentElement).toHaveTextContent(UNCONFIRMED);
      expect(screen.getByText('49,450,000 บาท').parentElement).toHaveTextContent(UNCONFIRMED);
      expect(screen.getAllByText(UNCONFIRMED)).toHaveLength(2);
      expect(screen.queryByText('ผู้ชนะ')).not.toBeInTheDocument();
      expect(screen.queryByText('ราคาที่ตกลงตามสัญญา')).not.toBeInTheDocument();
      expect(screen.queryByText('ราคาที่ผู้ชนะยื่น (จับคู่จากชื่อ)')).not.toBeInTheDocument();
    });

    test('the label is only for a number used in another year: other unresolved cases and winners have none', () => {
      const { unmount } = render(
        <TorAwardSummary
          award={summariseAward(
            [
              line({ contractNo: 'X', winnerName: 'บริษัท ก จำกัด' }),
              line({ contractNo: 'X', winnerName: 'บริษัท ข จำกัด' }),
            ],
            [],
          )}
        />,
      );
      expect(screen.getByText('ยังระบุผู้ชนะไม่ได้')).toBeInTheDocument();
      expect(screen.queryByText(UNCONFIRMED)).not.toBeInTheDocument();
      unmount();

      const unnumbered = render(
        <TorAwardSummary
          award={summariseAward(
            [
              line({ contractNo: null, winnerName: 'บริษัท ก จำกัด' }),
              line({ contractNo: null, winnerName: 'บริษัท ข จำกัด' }),
            ],
            [],
          )}
        />,
      );
      expect(screen.getByText('ยังระบุผู้ชนะไม่ได้')).toBeInTheDocument();
      expect(screen.queryByText(UNCONFIRMED)).not.toBeInTheDocument();
      unnumbered.unmount();

      render(<TorAwardSummary award={summariseAward([line({ contractNo: 'C-1' })], [])} />);
      expect(screen.queryByText('ยังระบุผู้ชนะไม่ได้')).not.toBeInTheDocument();
      expect(screen.queryByText(UNCONFIRMED)).not.toBeInTheDocument();
      expect(screen.getByText('ราคาที่ตกลงตามสัญญา')).toBeInTheDocument();
    });

    test('a lone line whose number is used by no other year is still shown as a winner', () => {
      render(
        <TorAwardSummary
          award={summariseAward(
            [
              line({ contractNo: 'C-1', winnerName: 'บริษัท ก จำกัด', contractYear: 2568 }),
              line({ contractNo: 'C-2', winnerName: 'บริษัท ข จำกัด', contractYear: 2569 }),
            ],
            [],
          )}
        />,
      );

      expect(screen.queryByText('ยังระบุผู้ชนะไม่ได้')).not.toBeInTheDocument();
      expect(screen.getByText('บริษัท ก จำกัด')).toBeInTheDocument();
      expect(screen.getByText('บริษัท ข จำกัด')).toBeInTheDocument();
    });

    test('an unresolved award shows the year of every line it lists, and years are not mixed in one block', () => {
      render(
        <TorAwardSummary
          award={summariseAward(
            [
              line({ contractNo: 'X', winnerName: 'บริษัท ก จำกัด', contractYear: 2568 }),
              line({ contractNo: 'X', winnerName: 'บริษัท ข จำกัด', contractYear: 2568 }),
              line({ contractNo: 'X', winnerName: 'บริษัท ค จำกัด', contractYear: 2569 }),
            ],
            [],
          )}
        />,
      );

      // The 2568 lines are one unresolved block; the 2569 line is another, never mixed in.
      expect(screen.getAllByText('ยังระบุผู้ชนะไม่ได้')).toHaveLength(2);
      const lines = screen.getAllByRole('listitem').filter((item) => item.querySelector('span'));
      const first = lines.find((item) => item.textContent?.startsWith('บริษัท ก จำกัด'))!;
      const second = lines.find((item) => item.textContent?.startsWith('บริษัท ข จำกัด'))!;
      expect(first).toHaveTextContent('ทำสัญญาปีงบประมาณ 2568');
      expect(second).toHaveTextContent('ทำสัญญาปีงบประมาณ 2568');
      // The 2569 line is its own block, not listed with the 2568 lines.
      expect(screen.getAllByText('บริษัท ค จำกัด')).toHaveLength(1);
      expect(screen.getByText('ทำสัญญาปีงบประมาณ 2569')).toBeInTheDocument();
    });
  });

  describe('bids of several contract years are never shown as one pool', () => {
    const inYear = (year: number, name: string, price: number, seqNo = 1): ContractSubmission => ({
      ...bid(name, price, seqNo),
      contractYear: year,
    });

    test('each year\u2019s items are headed by their year and counted apart', () => {
      render(
        <TorAwardSummary
          award={summariseAward(
            [line({ contractYear: 2569 })],
            [
              inYear(2568, 'บริษัท บี จำกัด', 100),
              inYear(2568, 'บริษัท ซี จำกัด', 200),
              inYear(2569, A, 300),
            ],
          )}
        />,
      );

      expect(
        screen.getByText('ผู้เสนอราคาแยกตามปีงบประมาณที่ทำสัญญา (ไม่รวมข้ามปี)'),
      ).toBeInTheDocument();
      expect(screen.getByText('ปีงบประมาณ 2568: 2 ราย')).toBeInTheDocument();
      expect(screen.getByText('ปีงบประมาณ 2569: 1 ราย')).toBeInTheDocument();
      expect(screen.queryByText(/^ผู้เสนอราคา \d+ ราย$/)).not.toBeInTheDocument();
      expect(screen.getAllByText(/^ทำสัญญาปีงบประมาณ 256[89] · รายการที่ 1/)).toHaveLength(2);
      expect(screen.getByText(/ข้อมูลของผู้เสนอราคาไม่มีปีมาด้วย/)).toBeInTheDocument();
    });

    test('a winner is matched only within its own year, and no cross-year bid is borrowed', () => {
      render(
        <TorAwardSummary
          award={summariseAward(
            [line({ contractYear: 2569 })],
            [inYear(2568, A, 80), inYear(2569, A, 100), inYear(2569, 'บริษัท บี จำกัด', 60)],
          )}
        />,
      );

      expect(
        screen.getByText('ราคาที่ผู้ชนะยื่น (จับคู่จากชื่อ)').nextElementSibling,
      ).toHaveTextContent('100 บาท');
      expect(screen.getByText('มีผู้เสนอราคาต่ำกว่าผู้ชนะ 1 ราย')).toBeInTheDocument();
    });

    test('a year with an unnamed bid says its count is unknown, the other year keeps its own', () => {
      render(
        <TorAwardSummary
          award={summariseAward(
            [],
            [{ ...bid(null, 100), contractYear: 2568 }, inYear(2569, A, 200)],
          )}
        />,
      );

      expect(screen.getByText('ปีงบประมาณ 2568: ไม่ทราบจำนวนที่แน่ชัด')).toBeInTheDocument();
      expect(screen.getByText('ปีงบประมาณ 2569: 1 ราย')).toBeInTheDocument();
    });

    test('the winner is marked among the bids of its own contract year, and only there', () => {
      render(
        <TorAwardSummary
          award={summariseAward(
            [line({ contractYear: 2569 })],
            [
              inYear(2568, A, 80),
              inYear(2568, 'บริษัท บี จำกัด', 70),
              inYear(2569, A, 100),
              inYear(2569, 'บริษัท ซี จำกัด', 60),
            ],
          )}
        />,
      );

      const marks = screen.getAllByText('ผู้ชนะ');
      expect(marks).toHaveLength(1);
      expect(marks[0]!.closest('li')).toHaveTextContent(A);
      expect(marks[0]!.closest('div.grid')).toHaveTextContent('ทำสัญญาปีงบประมาณ 2569');
    });

    test('no winner is marked when its bids are only in another year', () => {
      render(
        <TorAwardSummary
          award={summariseAward([line({ contractYear: 2569 })], [inYear(2568, A, 80)])}
        />,
      );

      expect(screen.queryByText('ผู้ชนะ')).not.toBeInTheDocument();
    });

    test('no winner is marked when its own year has several items, even if another year has one', () => {
      render(
        <TorAwardSummary
          award={summariseAward(
            [line({ contractYear: 2569 })],
            [inYear(2568, A, 1, 1), inYear(2569, A, 100, 1), inYear(2569, A, 200, 2)],
          )}
        />,
      );

      expect(screen.queryByText('ผู้ชนะ')).not.toBeInTheDocument();
    });

    test('an item with no line number is headed by its year, with its description when it has one', () => {
      render(
        <TorAwardSummary
          award={summariseAward(
            [],
            [
              { ...bid(A, 100, null, 'งานทั้งหมด'), contractYear: 2568 },
              { ...bid(A, 200, 1, null), contractYear: 2569 },
              { ...bid('บริษัท บี จำกัด', 300, null, null), contractYear: 2569 },
            ],
          )}
        />,
      );

      expect(screen.getByText('ทำสัญญาปีงบประมาณ 2568 · งานทั้งหมด')).toBeInTheDocument();
      expect(screen.getByText('ทำสัญญาปีงบประมาณ 2569 · รายการที่ 1')).toBeInTheDocument();
      expect(screen.getByText('ทำสัญญาปีงบประมาณ 2569')).toBeInTheDocument();
      expect(screen.queryByText(/รายการที่ null/)).not.toBeInTheDocument();
    });

    test('bids of one year are shown as before, with a single project count', () => {
      render(<TorAwardSummary award={summariseAward([line()], [inYear(2569, A, 300)])} />);

      expect(screen.getByText('ผู้เสนอราคา 1 ราย')).toBeInTheDocument();
      expect(screen.queryByText(/ไม่รวมข้ามปี/)).not.toBeInTheDocument();
    });
  });
});

describe('TorAwardSummary: a blank name reads as an unnamed one', () => {
  const BLANKS = ['', '   ', '\t\n'];

  test.each(BLANKS)(
    'a contract line listed as published, named %p, shows "ไม่ระบุชื่อ"',
    (blank) => {
      render(
        <TorAwardSummary
          award={summariseAward(
            [
              line({ contractNo: 'X', winnerName: blank }),
              line({ contractNo: 'X', winnerName: 'บริษัท บี จำกัด' }),
            ],
            [],
          )}
        />,
      );

      expect(screen.getByText('ยังระบุผู้ชนะไม่ได้')).toBeInTheDocument();
      // The blank-named line is listed under "unnamed", with its own year.
      const unnamed = screen.getByText('ไม่ระบุชื่อ').closest('li') as HTMLElement;
      expect(unnamed.textContent?.startsWith('ไม่ระบุชื่อ')).toBe(true);
      expect(unnamed).toHaveTextContent('ทำสัญญาปีงบประมาณ 2569');
      expect(screen.getByText('บริษัท บี จำกัด')).toBeInTheDocument();
    },
  );

  test.each(BLANKS)('a joint-venture member named %p is listed as "ไม่ระบุชื่อ"', (blank) => {
    render(
      <TorAwardSummary
        award={summariseAward(
          [
            line({ contractNo: 'JV', winnerName: 'กิจการค้าร่วม เอ็นบี' }),
            line({ contractNo: 'JV', winnerName: 'บริษัท ก จำกัด', priceAgree: 0 }),
            line({ contractNo: 'JV', winnerName: blank, priceAgree: 0 }),
          ],
          [],
        )}
      />,
    );

    expect(screen.getByText('สมาชิก: บริษัท ก จำกัด, ไม่ระบุชื่อ')).toBeInTheDocument();
  });

  test.each(BLANKS)(
    'a winner named %p is shown as an unnamed winner, with no price match',
    (blank) => {
      render(
        <TorAwardSummary
          award={summariseAward([line({ winnerName: blank })], [bid(blank, 100), bid(A, 200)])}
        />,
      );

      expect(screen.getByText('ไม่ระบุชื่อผู้ชนะ')).toBeInTheDocument();
      expect(screen.queryByText(/จับคู่จากชื่อ/)).not.toBeInTheDocument();
      expect(screen.queryByText('ผู้ชนะ')).not.toBeInTheDocument();
    },
  );

  test.each(BLANKS)('a bidder named %p is shown as unnamed, and the count is unknown', (blank) => {
    render(<TorAwardSummary award={summariseAward([line()], [bid(A, 100), bid(blank, 200)])} />);

    expect(screen.getByText('ไม่ระบุชื่อ')).toBeInTheDocument();
    expect(screen.getByText('ไม่ทราบจำนวนผู้เสนอราคาที่แน่ชัด')).toBeInTheDocument();
    expect(screen.queryByText(/^ผู้เสนอราคา \d+ ราย$/)).not.toBeInTheDocument();
  });

  test.each(BLANKS)(
    'a summary built elsewhere, with a winner or bidder named %p, is shown the same way',
    (blank) => {
      const summary = summariseAward(
        [line({ winnerName: A })],
        [bid(A, 100), bid('บริษัท บี จำกัด', 200)],
      );
      const built = {
        ...summary,
        awards: summary.awards.map((entry) => ({ ...entry, winnerName: blank })),
        items: summary.items.map((item) => ({
          ...item,
          bids: item.bids.map((entry) => ({ ...entry, merchantName: blank })),
        })),
      };
      render(<TorAwardSummary award={built} />);

      expect(screen.getByText('ไม่ระบุชื่อผู้ชนะ')).toBeInTheDocument();
      expect(screen.getAllByText('ไม่ระบุชื่อ')).toHaveLength(2);
      expect(screen.queryByText('ผู้ชนะ')).not.toBeInTheDocument();
    },
  );

  test('named winners, members and bidders are shown as published, and the winner is still marked', () => {
    render(
      <TorAwardSummary
        award={summariseAward(
          [line({ winnerName: A })],
          [bid(A, 100), bid('บริษัท บี จำกัด', 200)],
        )}
      />,
    );

    expect(screen.getAllByText(A).length).toBeGreaterThan(0);
    expect(screen.getByText('บริษัท บี จำกัด')).toBeInTheDocument();
    expect(screen.getByText('ผู้ชนะ')).toBeInTheDocument();
    expect(screen.queryByText('ไม่ระบุชื่อ')).not.toBeInTheDocument();
    expect(screen.queryByText('ไม่ระบุชื่อผู้ชนะ')).not.toBeInTheDocument();
  });
});
