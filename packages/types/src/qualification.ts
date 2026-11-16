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

export const CompanyQualificationsSchema = z.object({
  registeredCapitalThb: MoneyThbSchema.nullable(),
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
export const CompanyQualificationsPayloadSchema = z.object({
  company_id: CompanyQualificationsRecordSchema.shape.companyId,
  revision: CompanyQualificationsRecordSchema.shape.revision,
  registered_capital_thb: CompanyQualificationsSchema.shape.registeredCapitalThb,
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
});
export type CompanyQualificationsPayload = z.infer<typeof CompanyQualificationsPayloadSchema>;

export function toCompanyQualificationsPayload(
  record: CompanyQualificationsRecord,
): CompanyQualificationsPayload {
  return {
    company_id: record.companyId,
    revision: record.revision,
    registered_capital_thb: record.registeredCapitalThb,
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

export const QualificationCheckSchema = z.object({
  status: z.enum(['met', 'not_met', 'unknown']),
  evidence: z.array(z.string()),
});
export type QualificationCheck = z.infer<typeof QualificationCheckSchema>;
