import { describe, expect, test } from 'bun:test';
import {
  CompanyQualificationsPayloadSchema,
  fromCompanyQualificationsPayload,
  toCompanyQualificationsPayload,
} from './qualification';

const payload = {
  company_id: 'company',
  revision: null,
  registered_capital_thb: null,
  certificates: [],
  personnel: [],
};

describe('bid budget range on the wire', () => {
  test('a payload from before the rule reads as no range', () => {
    const parsed = CompanyQualificationsPayloadSchema.parse(payload);
    expect(parsed).toMatchObject({ bid_budget_min_thb: null, bid_budget_max_thb: null });
  });

  test('round-trips between wire and domain', () => {
    const wire = CompanyQualificationsPayloadSchema.parse({
      ...payload,
      bid_budget_min_thb: 1_000_000,
      bid_budget_max_thb: 5_000_000,
    });
    const record = fromCompanyQualificationsPayload(wire);
    expect(record).toMatchObject({ bidBudgetMinThb: 1_000_000, bidBudgetMaxThb: 5_000_000 });
    expect(toCompanyQualificationsPayload(record)).toEqual(wire);
  });

  test('a minimum above the maximum is refused', () => {
    const result = CompanyQualificationsPayloadSchema.safeParse({
      ...payload,
      bid_budget_min_thb: 9,
      bid_budget_max_thb: 1,
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['bid_budget_max_thb']);
  });
});
