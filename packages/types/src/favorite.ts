import { z } from 'zod';

/**
 * A Procurement a Business Development Officer has set aside to reconsider
 * later.
 *
 * Personal to the account that saved it, unlike a `Client` or an `Experience`
 * — a colleague at the same Company does not see it, because a shortlist is a
 * matter of individual judgement, not a Company record.
 */
export const FavoriteSchema = z.object({
  id: z.string(),
  userId: z.string(),
  projectId: z.string(),
  createdAt: z.coerce.date(),
});
export type Favorite = z.infer<typeof FavoriteSchema>;
