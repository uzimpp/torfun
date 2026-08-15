import { z } from 'zod';

/** RBAC roles per USR-10: admin manages accounts, BD officer searches/screens TORs. */
export const UserRole = z.enum(['admin', 'business_development_officer']);
export type UserRole = z.infer<typeof UserRole>;

export const UserSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  name: z.string().min(1),
  role: UserRole,
  isActive: z.boolean().default(true),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type User = z.infer<typeof UserSchema>;
