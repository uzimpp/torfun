import { z } from 'zod';
import { ProcurementSchema } from './egp';

/**
 * What the Site Administrator's header alert shows (FR-14): how many records
 * the model could not decide and are held for a person, and the newest few.
 */
export const ReviewAlertsSchema = z.object({
  waiting: z.number().int().nonnegative(),
  latest: z.array(
    ProcurementSchema.pick({
      projectId: true,
      projectName: true,
      deptName: true,
      holdReason: true,
    }),
  ),
});
export type ReviewAlerts = z.infer<typeof ReviewAlertsSchema>;
