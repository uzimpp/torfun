import { z } from 'zod';
import { TargetPlatform } from './egp';

/**
 * The vendor side of a match.
 *
 * `Procurement` describes what an agency wants built; `Company` and its
 * `Experience` records describe what a software house has already built. The two
 * are deliberately expressed in one vocabulary — see ADR-0009 — so a later
 * matching feature compares like with like instead of reconciling two lists that
 * were never designed to agree.
 */

/** Thai block, U+0E00–U+0E7F. */
const THAI = /[฀-๿]/;
const LATIN = /[A-Za-z]/;

/**
 * A Thai registered name: at least one Thai character, no Latin letters, and
 * otherwise whatever digits, spaces and punctuation the registrar allowed —
 * `บริษัท ทรู คอร์ปอเรชั่น จำกัด (มหาชน)` is a real name and must pass.
 *
 * The rule exists to catch one specific mistake, which is typing the English
 * name into the Thai field. It is not an attempt to validate that a company
 * exists.
 */
export const ThaiCompanyName = z
  .string()
  .trim()
  .min(1, 'กรุณากรอกชื่อบริษัท')
  .max(200)
  .refine((value) => THAI.test(value), {
    message: 'ชื่อบริษัทต้องเป็นภาษาไทย',
  })
  .refine((value) => !LATIN.test(value), {
    message: 'ชื่อบริษัทต้องไม่มีตัวอักษรภาษาอังกฤษ',
  });

/**
 * Legal forms worth recognising, kept broad on purpose: a vendor may be a
 * limited partnership, and a Client may be a ministry, a university or a
 * foundation. Used only to decide whether the UI shows a hint — never to reject
 * a name, because the list can never be complete.
 */
const LEGAL_FORMS = [
  'บริษัท',
  'บจก',
  'บมจ',
  'ห้างหุ้นส่วน',
  'หจก',
  'ห.จ.ก',
  'ร้าน',
  'มูลนิธิ',
  'สมาคม',
  'สหกรณ์',
  'องค์การ',
  'กรม',
  'กระทรวง',
  'สำนักงาน',
  'มหาวิทยาลัย',
  'โรงพยาบาล',
  'เทศบาล',
  'การไฟฟ้า',
  'การประปา',
];

/** Whether a name looks like a registered entity. A hint, not a rule. */
export function hasRecognisableLegalForm(name: string): boolean {
  return LEGAL_FORMS.some((form) => name.includes(form));
}

/**
 * เลขประจำตัวผู้เสียภาษีอากร — 13 digits, the same number the DBD registers a
 * juristic person under. Length only: the check-digit algorithm is widely
 * described but unverified against a primary source here, and a checksum we got
 * wrong would reject real companies with no way around it.
 */
export const Tin = z.string().regex(/^\d{13}$/, 'TIN ต้องเป็นตัวเลข 13 หลัก');

export const CompanySchema = z.object({
  id: z.string(),
  /** The registered Thai name. The only name this system holds. */
  nameTh: ThaiCompanyName,
  /** Optional, and carries no uniqueness constraint — see ADR-0008. */
  tin: Tin.nullable(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type Company = z.infer<typeof CompanySchema>;

/**
 * Whether a Client is a government body or a private customer.
 *
 * Answered once per Client rather than once per Experience, and it is the only
 * signal this feature captures that a future `industryScore` could read.
 */
export const ClientKind = z.enum(['government', 'private']);
export type ClientKind = z.infer<typeof ClientKind>;

/**
 * An organisation a Company has delivered work for.
 *
 * Never the Company itself and never a user of this system: a Client has no
 * account and never signs in. Scoped to one Company, so two vendors who both
 * worked for the same ministry hold two separate records and neither knows about
 * the other.
 */
export const ClientSchema = z.object({
  id: z.string(),
  companyId: z.string(),
  /** Free text. Government names are *suggested* from `Procurement.deptName`,
   *  never constrained to it — a vendor may have served a body this system has
   *  not ingested. */
  name: z.string().trim().min(1).max(200),
  kind: ClientKind,
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type Client = z.infer<typeof ClientSchema>;

/** The unit a person chose, kept so the page can show back what they typed. */
export const DurationUnit = z.enum(['months', 'years']);
export type DurationUnit = z.infer<typeof DurationUnit>;

/**
 * One piece of work a Company delivered for a Client.
 *
 * Only `clientId` and `projectName` are required. Everything else is optional so
 * that an officer with thirty projects to enter can get them down quickly — at
 * the known cost that a record without `techStack` or `targetPlatforms` cannot
 * contribute to those parts of a future score.
 */
export const ExperienceSchema = z.object({
  id: z.string(),
  companyId: z.string(),
  clientId: z.string(),
  projectName: z.string().trim().min(1).max(300),
  description: z.string().max(2000).nullable(),
  /** Same shape as `TorAnalysis.techStack`. */
  techStack: z.array(z.string().trim().min(1)).default([]),
  /** The same enum a TOR is read into, not a parallel list. */
  targetPlatforms: z.array(TargetPlatform).default([]),
  /**
   * Canonical length in whole months. Years convert by twelve, exactly, which is
   * why months rather than days is what gets stored: the lossy step belongs in
   * matching, not in storage.
   */
  durationMonths: z.number().int().positive().nullable(),
  /** What the person picked. `null` whenever `durationMonths` is null. */
  durationUnit: DurationUnit.nullable(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type Experience = z.infer<typeof ExperienceSchema>;

/**
 * A duration as it should be shown: two years reads back as two years, never as
 * twenty four months.
 */
export function displayDuration(
  months: number | null,
  unit: DurationUnit | null,
): { value: number; unit: DurationUnit } | null {
  if (months === null || unit === null) return null;
  return unit === 'years' ? { value: months / 12, unit } : { value: months, unit };
}

/** The inverse: what a person entered, in the canonical unit. */
export function toDurationMonths(value: number, unit: DurationUnit): number {
  return unit === 'years' ? value * 12 : value;
}
