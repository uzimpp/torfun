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

    expect(screen.getByText('ผู้ชนะและราคาจาก open data')).toBeInTheDocument();
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
    expect(
      screen.getByText('ราคาที่ตกลงรวม (ตามที่ open data เผยแพร่)').nextElementSibling,
    ).toHaveTextContent('2,830,000 บาท');
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
    expect(screen.getByText(/แสดงตามที่ open data เผยแพร่/)).toBeInTheDocument();
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
    expect(screen.getByText('ผู้เสนอราคา 1 ราย')).toBeInTheDocument();
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
});
