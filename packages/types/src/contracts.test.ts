import { describe, expect, test } from 'bun:test';
import {
  ContractSchema,
  ContractSubmissionSchema,
  ContractYearQuerySchema,
  ProjectContractSubmissionsResponseSchema,
  ProjectContractsResponseSchema,
} from './contracts';

// Fixtures only: the shapes the API stores, not records from a real run.
const contract = {
  projectId: 'project-1',
  contractYear: 2569,
  contractNo: 'CN-1',
  winnerName: 'Winner Co.',
  winnerTin: null,
  priceAgree: 2_995_000,
  contractDate: null,
  contractFinishDate: null,
  status: null,
};

const submission = {
  projectId: 'project-1',
  contractYear: 2569,
  merchantName: 'Bidder Co.',
  seqNo: 1,
  seqNoDesc: 'Item 1',
  submitPrice: 3_000_000,
};

describe('ContractSchema', () => {
  test('keeps every missing value as null, not a default', () => {
    const parsed = ContractSchema.parse({
      ...contract,
      contractNo: null,
      winnerName: null,
      priceAgree: null,
    });
    expect(parsed.winnerName).toBeNull();
    expect(parsed.priceAgree).toBeNull();
  });

  test('rejects a missing field instead of filling it in', () => {
    const { priceAgree: _omitted, ...incomplete } = contract;
    expect(ContractSchema.safeParse(incomplete).success).toBe(false);
  });

  test('requires an integer contract year', () => {
    expect(ContractSchema.safeParse({ ...contract, contractYear: 2569.5 }).success).toBe(false);
  });
});

describe('ContractSubmissionSchema', () => {
  test('accepts a line item with a parsed price', () => {
    expect(ContractSubmissionSchema.parse(submission)).toEqual(submission);
  });

  test('a bid with no readable price or line item is null, and still valid', () => {
    const parsed = ContractSubmissionSchema.parse({
      ...submission,
      seqNo: null,
      seqNoDesc: null,
      submitPrice: null,
    });
    expect(parsed.submitPrice).toBeNull();
    expect(parsed.seqNo).toBeNull();
  });

  test('the API sends the price as a string; storing it unparsed is rejected', () => {
    expect(ContractSubmissionSchema.safeParse({ ...submission, submitPrice: '3000000.00' }).success).toBe(
      false,
    );
  });

  test('a line item number is an integer', () => {
    expect(ContractSubmissionSchema.safeParse({ ...submission, seqNo: 1.5 }).success).toBe(false);
  });
});

describe('response and query schemas', () => {
  test('wrap items', () => {
    expect(ProjectContractsResponseSchema.parse({ items: [contract] }).items).toHaveLength(1);
    expect(ProjectContractSubmissionsResponseSchema.parse({ items: [submission] }).items).toHaveLength(1);
  });

  test('contract_year is an optional positive integer, coerced from the query string', () => {
    expect(ContractYearQuerySchema.parse({}).contract_year).toBeUndefined();
    expect(ContractYearQuerySchema.parse({ contract_year: '2569' }).contract_year).toBe(2569);
    expect(ContractYearQuerySchema.safeParse({ contract_year: '0' }).success).toBe(false);
  });
});
