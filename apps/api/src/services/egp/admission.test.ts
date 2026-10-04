import { describe, expect, test } from 'bun:test';
import { admit, type Admission } from './admission';
import { E_BIDDING_METHOD } from './constants';

const expectedNames = new Set(['กรมศุลกากร']);

const row = {
  projectId: '111',
  deptName: 'กรมศุลกากร',
  purchaseMethodName: E_BIDDING_METHOD as string | undefined,
};

describe('admit', () => {
  const cases: Array<{
    name: string;
    input: typeof row;
    tombstoned: string[];
    expected: Admission;
  }> = [
    {
      name: 'a registry agency, e-bidding, not tombstoned',
      input: row,
      tombstoned: [],
      expected: 'admit',
    },
    {
      name: 'an agency the dept_code answered with but the registry does not name',
      input: { ...row, deptName: 'สำนักงานสถิติแห่งชาติ' },
      tombstoned: [],
      expected: 'not_registry',
    },
    {
      name: 'a registry name that only matches by substring',
      input: { ...row, deptName: 'กรมศุลกากร สาขา' },
      tombstoned: [],
      expected: 'not_registry',
    },
    {
      name: 'a purchase method other than e-bidding',
      input: { ...row, purchaseMethodName: 'วิธีเฉพาะเจาะจง' },
      tombstoned: [],
      expected: 'not_e_bidding',
    },
    {
      name: 'no purchase method at all',
      input: { ...row, purchaseMethodName: undefined },
      tombstoned: [],
      expected: 'not_e_bidding',
    },
    {
      name: 'a project that has a tombstone',
      input: row,
      tombstoned: ['111'],
      expected: 'tombstoned',
    },
    {
      name: 'a tombstone on some other project',
      input: row,
      tombstoned: ['999'],
      expected: 'admit',
    },
    {
      name: 'a tombstoned project outside the registry is still not the registry',
      input: { ...row, deptName: 'หน่วยงานอื่น' },
      tombstoned: ['111'],
      expected: 'not_registry',
    },
  ];

  test.each(cases)('$name', ({ input, tombstoned, expected }) => {
    expect(admit(input, expectedNames, new Set(tombstoned))).toBe(expected);
  });
});
