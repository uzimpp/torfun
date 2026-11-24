import { z } from 'zod';

const label = z.string().trim().min(1).max(200);
export const WorkTypeSchema = label;
export const MoneyThbSchema = z.number().nonnegative().max(Number.MAX_SAFE_INTEGER);
const years = z.number().nonnegative().max(100);
const standard = label;
const clause = z.object({
  text: z.string().trim().min(1).max(2000),
  source: z.string().trim().min(1).max(200),
  // Legacy extractions did not say whether the structured fields cover the whole clause.
  manualReviewReason: z.string().trim().min(1).max(500).nullable().optional(),
});

export const TorQualificationSchema = z.discriminatedUnion('kind', [
  clause.extend({
    kind: z.literal('personnel'),
    role: label,
    headcount: z.number().int().positive().nullable(),
    degree: label.nullable(),
    minYears: years.nullable(),
    certificates: z.array(standard),
  }),
  clause.extend({
    kind: z.literal('past_work'),
    workType: WorkTypeSchema.nullable(),
    minValueThb: MoneyThbSchema.nullable(),
  }),
  clause.extend({
    kind: z.literal('registered_capital'),
    minValueThb: MoneyThbSchema,
  }),
  clause.extend({
    kind: z.literal('company_certificate'),
    standard,
    issuer: label.nullable(),
  }),
  clause.extend({ kind: z.literal('manual') }),
]);
export type TorQualification = z.infer<typeof TorQualificationSchema>;

export const CompanyCertificateSchema = z.object({
  name: label,
  standard,
  issuer: label,
  validUntil: z.string().date(),
});
export type CompanyCertificate = z.infer<typeof CompanyCertificateSchema>;

// Management-system certifications are recorded against the organization.
const organizationStandard = /\b(?:ISO|IEC)\s*(?:[/-]\s*(?:ISO|IEC)\s*)?\d|\bCMMI\b/i;

export const PersonnelQualificationSchema = z.object({
  role: label,
  yearsOfExperience: years.nullable(),
  degree: label.nullable(),
  certificates: z
    .array(
      standard.refine(
        (value) => !organizationStandard.test(value.normalize('NFKC')),
        'บันทึกมาตรฐาน ISO/IEC และ CMMI ในใบรับรองบริษัท',
      ),
    )
    .max(30)
    .nullable(),
});
export type PersonnelQualification = z.infer<typeof PersonnelQualificationSchema>;

/**
 * The price-based decision rule (FR-29): the range of announced budgets the
 * company bids for. A TOR outside it scores 0, like a failed qualification.
 * Either end may be open; both null means no rule.
 */
const bidBudgetInOrder = (value: {
  bidBudgetMinThb?: number | null;
  bidBudgetMaxThb?: number | null;
}) =>
  value.bidBudgetMinThb == null ||
  value.bidBudgetMaxThb == null ||
  value.bidBudgetMinThb <= value.bidBudgetMaxThb;
const BID_BUDGET_ORDER_MESSAGE = 'งบประมาณขั้นต่ำต้องไม่มากกว่างบประมาณสูงสุด';

export const CompanyQualificationsSchema = z.object({
  registeredCapitalThb: MoneyThbSchema.nullable(),
  bidBudgetMinThb: MoneyThbSchema.nullable().default(null),
  bidBudgetMaxThb: MoneyThbSchema.nullable().default(null),
  certificates: z.array(CompanyCertificateSchema).max(100),
  personnel: z.array(PersonnelQualificationSchema).max(100),
});
export type CompanyQualifications = z.infer<typeof CompanyQualificationsSchema>;

export const CompanyQualificationsRecordSchema = CompanyQualificationsSchema.extend({
  companyId: z.string(),
  revision: z.string().uuid().nullable(),
});
export type CompanyQualificationsRecord = z.infer<typeof CompanyQualificationsRecordSchema>;

/** Company endpoints use snake_case on the wire. */
export const CompanyQualificationsPayloadSchema = z
  .object({
    company_id: CompanyQualificationsRecordSchema.shape.companyId,
    revision: CompanyQualificationsRecordSchema.shape.revision,
    registered_capital_thb: CompanyQualificationsSchema.shape.registeredCapitalThb,
    bid_budget_min_thb: CompanyQualificationsSchema.shape.bidBudgetMinThb,
    bid_budget_max_thb: CompanyQualificationsSchema.shape.bidBudgetMaxThb,
    certificates: z
      .array(
        CompanyCertificateSchema.omit({ validUntil: true }).extend({
          valid_until: CompanyCertificateSchema.shape.validUntil,
        }),
      )
      .max(100),
    personnel: z
      .array(
        PersonnelQualificationSchema.omit({ yearsOfExperience: true }).extend({
          years_of_experience: PersonnelQualificationSchema.shape.yearsOfExperience,
        }),
      )
      .max(100),
  })
  .refine(
    (payload) =>
      bidBudgetInOrder({
        bidBudgetMinThb: payload.bid_budget_min_thb,
        bidBudgetMaxThb: payload.bid_budget_max_thb,
      }),
    { message: BID_BUDGET_ORDER_MESSAGE, path: ['bid_budget_max_thb'] },
  );
export type CompanyQualificationsPayload = z.infer<typeof CompanyQualificationsPayloadSchema>;

export function toCompanyQualificationsPayload(
  record: CompanyQualificationsRecord,
): CompanyQualificationsPayload {
  return {
    company_id: record.companyId,
    revision: record.revision,
    registered_capital_thb: record.registeredCapitalThb,
    bid_budget_min_thb: record.bidBudgetMinThb,
    bid_budget_max_thb: record.bidBudgetMaxThb,
    certificates: record.certificates.map(({ validUntil, ...item }) => ({
      ...item,
      valid_until: validUntil,
    })),
    personnel: record.personnel.map(({ yearsOfExperience, ...item }) => ({
      ...item,
      years_of_experience: yearsOfExperience,
    })),
  };
}

export function fromCompanyQualificationsPayload(
  payload: CompanyQualificationsPayload,
): CompanyQualificationsRecord {
  return {
    companyId: payload.company_id,
    revision: payload.revision,
    registeredCapitalThb: payload.registered_capital_thb,
    bidBudgetMinThb: payload.bid_budget_min_thb,
    bidBudgetMaxThb: payload.bid_budget_max_thb,
    certificates: payload.certificates.map(({ valid_until, ...item }) => ({
      ...item,
      validUntil: valid_until,
    })),
    personnel: payload.personnel.map(({ years_of_experience, ...item }) => ({
      ...item,
      yearsOfExperience: years_of_experience,
    })),
  };
}

export function certificateExpired(certificate: CompanyCertificate, todayInThailand: string) {
  return certificate.validUntil < todayInThailand;
}

/** The parts of the company's record that a clause is checked against. */
export const COMPANY_SETUP_SECTIONS = [
  'experience',
  'certificates',
  'personnel',
  'capital',
] as const;
export type CompanySetupSection = (typeof COMPANY_SETUP_SECTIONS)[number];

/**
 * Why a clause is not `met`, so a screen can say what to do about it rather than
 * parse the evidence text. Three kinds:
 *  - `setup`: the company has not recorded what this clause needs. Recording it
 *    can change the answer, and `section` says where.
 *  - `not_met`: the company recorded it and it falls short.
 *  - `review`: the system cannot decide; a person reads the source TOR.
 */
export const QUALIFICATION_REASONS = {
  setup_experience: { kind: 'setup', section: 'experience' },
  setup_certificates: { kind: 'setup', section: 'certificates' },
  setup_personnel: { kind: 'setup', section: 'personnel' },
  setup_capital: { kind: 'setup', section: 'capital' },
  capital_below: { kind: 'not_met', section: 'capital' },
  certificate_missing: { kind: 'not_met', section: 'certificates' },
  certificate_expired: { kind: 'not_met', section: 'certificates' },
  experience_missing: { kind: 'not_met', section: 'experience' },
  personnel_short: { kind: 'not_met', section: 'personnel' },
  budget_outside_range: { kind: 'not_met', section: null },
  manual_review: { kind: 'review', section: null },
  budget_not_announced: { kind: 'review', section: null },
} as const satisfies Record<
  string,
  { kind: 'setup' | 'not_met' | 'review'; section: CompanySetupSection | null }
>;
export type QualificationReason = keyof typeof QUALIFICATION_REASONS;

export const QualificationReasonSchema = z.enum(
  Object.keys(QUALIFICATION_REASONS) as [QualificationReason, ...QualificationReason[]],
);

export const QualificationCheckSchema = z.object({
  status: z.enum(['met', 'not_met', 'unknown']),
  evidence: z.array(z.string()),
  /** Absent when `met`, and on results computed before reasons existed. */
  reason: QualificationReasonSchema.optional(),
});
export type QualificationCheck = z.infer<typeof QualificationCheckSchema>;

/** A TOR's checks counted, for a headline that says why the score is what it is. */
export const QualificationSummarySchema = z.object({
  total: z.number().int().nonnegative(),
  met: z.number().int().nonnegative(),
  notMet: z.number().int().nonnegative(),
  /** Unanswered because the company has not recorded something. */
  needsSetup: z.number().int().nonnegative(),
  /** Unanswered because a person must read the source TOR. */
  needsReview: z.number().int().nonnegative(),
  /** The company's price-based rule rules this TOR out (FR-29). */
  budgetOutsideRange: z.boolean(),
  /** Which parts of the company's record to fill in, in the order they are listed. */
  setupSections: z.array(z.enum(COMPANY_SETUP_SECTIONS)),
});
export type QualificationSummary = z.infer<typeof QualificationSummarySchema>;

export function summarizeQualificationChecks(
  checks: readonly QualificationCheck[],
  budgetRule?: QualificationCheck | null,
): QualificationSummary {
  const setupSections = new Set<CompanySetupSection>();
  let met = 0;
  let notMet = 0;
  let needsSetup = 0;
  let needsReview = 0;
  for (const item of checks) {
    if (item.status === 'met') met += 1;
    else if (item.status === 'not_met') notMet += 1;
    else if (item.reason && QUALIFICATION_REASONS[item.reason].kind === 'setup') {
      needsSetup += 1;
      setupSections.add(QUALIFICATION_REASONS[item.reason].section!);
    } else needsReview += 1;
  }
  return {
    total: checks.length,
    met,
    notMet,
    needsSetup,
    needsReview,
    budgetOutsideRange: budgetRule?.status === 'not_met',
    setupSections: COMPANY_SETUP_SECTIONS.filter((section) => setupSections.has(section)),
  };
}
