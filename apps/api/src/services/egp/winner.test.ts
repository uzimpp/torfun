import { describe, expect, test } from 'bun:test';
import { toWinner } from './winner';

const contract = {
  winner_tin: '0105564068059',
  winner_name: 'บริษัท เอสซีบี เทคเอกซ์ จำกัด',
  contract_no: 'DGA/68/0175',
  contract_date: '15 ก.ย. 68',
  contract_finish_date: '15 พ.ค. 69',
  price_agree: 47_000_000,
  status: 'ระหว่างดำเนินการ',
};

describe('toWinner', () => {
  test('reads the award, with the agreed price on it', () => {
    // The price the work actually sold for belongs to the award, not to the
    // project — the project has its own budget, and they disagree on purpose.
    expect(toWinner([contract])).toEqual({
      name: 'บริษัท เอสซีบี เทคเอกซ์ จำกัด',
      taxId: '0105564068059',
      contractNo: 'DGA/68/0175',
      contractDate: '15 ก.ย. 68',
      contractFinishDate: '15 พ.ค. 69',
      priceAgree: 47_000_000,
    });
  });

  test('no award yet is null, not an empty object', () => {
    expect(toWinner(undefined)).toBeNull();
    expect(toWinner([])).toBeNull();
    expect(toWinner(null)).toBeNull();
  });

  test('a bare object rather than an array is still read', () => {
    expect(toWinner(contract)?.contractNo).toBe('DGA/68/0175');
  });

  test('several awards on one project resolve to the largest', () => {
    // Every project sampled had exactly one contract, but the field is an
    // array, so this is what happens if that ever stops being true.
    const winner = toWinner([
      { ...contract, contract_no: 'A', price_agree: 1_000_000 },
      { ...contract, contract_no: 'B', price_agree: 9_000_000 },
    ]);
    expect(winner?.contractNo).toBe('B');
  });

  test('an award with no usable name is not an award', () => {
    expect(toWinner([{ ...contract, winner_name: '' }])).toBeNull();
  });

  test('a missing agreed price is null rather than zero', () => {
    // Zero would read as "won for nothing" in an average.
    expect(toWinner([{ ...contract, price_agree: undefined }])?.priceAgree).toBeNull();
  });
});
