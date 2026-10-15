import { z } from 'zod';

export const TorReportReason = z.enum([
  'unreasonable_requirements',
  'incorrect_information',
  'outdated',
  'invalid_document',
  'other',
]);
export type TorReportReason = z.infer<typeof TorReportReason>;

export const TOR_REPORT_REASON_LABELS: Record<TorReportReason, string> = {
  unreasonable_requirements: 'เงื่อนไขหรือข้อกำหนดไม่สมเหตุสมผล',
  incorrect_information: 'ข้อมูล TOR ไม่ถูกต้อง',
  outdated: 'ข้อมูลหรือสถานะ TOR ไม่เป็นปัจจุบัน',
  invalid_document: 'เอกสารไม่ใช่ TOR หรือไม่สมบูรณ์',
  other: 'อื่นๆ',
};

export const CreateTorReportSchema = z
  .object({
    reason: TorReportReason,
    details: z.string().trim().max(2000, 'รายละเอียดต้องไม่เกิน 2,000 ตัวอักษร').optional(),
  })
  .strict()
  .superRefine((input, context) => {
    if (input.reason === 'other' && !input.details) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['details'],
        message: 'กรุณาระบุรายละเอียดเมื่อเลือกอื่นๆ',
      });
    }
  });
export type CreateTorReport = z.infer<typeof CreateTorReportSchema>;

/** A report records what the person saw; it never changes publication itself. */
export interface TorReport {
  id: string;
  projectId: string;
  projectName: string;
  deptName: string;
  reporter: { id: string; username: string; fullName: string; email: string | null };
  reason: TorReportReason;
  details: string | null;
  status: 'pending';
  createdAt: string;
}

export const TorReportResponseSchema = z.object({
  id: z.string(),
  project_id: z.string(),
  project_name: z.string(),
  dept_name: z.string(),
  reporter: z.object({
    id: z.string(),
    username: z.string(),
    full_name: z.string(),
    email: z.string().nullable(),
  }),
  reason: TorReportReason,
  details: z.string().nullable(),
  status: z.literal('pending'),
  created_at: z.string().datetime(),
});
export type TorReportResponse = z.infer<typeof TorReportResponseSchema>;

export const TorReportListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().nonnegative().default(0),
});
export const TorReportListResponseSchema = z.object({
  items: z.array(TorReportResponseSchema),
  total: z.number().int().nonnegative(),
  limit: z.number().int(),
  offset: z.number().int(),
});
export type TorReportListResponse = z.infer<typeof TorReportListResponseSchema>;
