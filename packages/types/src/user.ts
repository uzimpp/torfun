import { z } from 'zod';

export const UserRole = z.enum(['admin', 'business_development_officer']);
export type UserRole = z.infer<typeof UserRole>;

export const UserSchema = z.object({
  id: z.string(),
  /** Login identifier, distinct from the person's name. */
  username: z.string().min(3).max(50),
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  companyName: z.string().max(200),
  role: UserRole,
  /** Absent on password-only accounts; Google sign-in always supplies one. */
  email: z.string().email().optional(),
  isActive: z.boolean().default(true),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type User = z.infer<typeof UserSchema>;

/** Convenience for display: "Somchai Prasert". */
export function fullName(user: Pick<User, 'firstName' | 'lastName'>): string {
  return `${user.firstName} ${user.lastName}`.trim();
}
