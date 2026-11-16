import { z } from 'zod';

export const UserRole = z.enum(['admin', 'business_development_officer']);
export type UserRole = z.infer<typeof UserRole>;

export const UserSchema = z.object({
  id: z.string(),
  /** Login identifier, distinct from the person's name. */
  username: z.string().min(3).max(50),
  firstName: z.string().min(1).max(100),
  lastName: z.string().max(100),
  /**
   * The Company this officer belongs to, or null before they have joined one.
   * Null is what the web gate redirects on; administrators are exempt and are
   * expected to stay null.
   *
   * This replaces the old free-text `companyName`. The Company owns its own name
   * now (ADR-0007), so a user document no longer carries a second copy of it.
   */
  companyId: z.string().nullable(),
  role: UserRole,
  /** Absent on password-only accounts; Google sign-in always supplies one. */
  email: z.string().email().optional(),
  isActive: z.boolean().default(true),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type User = z.infer<typeof UserSchema>;

export const UpdateProfileSchema = z.strictObject({
  first_name: UserSchema.shape.firstName.trim().min(1),
  last_name: UserSchema.shape.lastName.trim(),
});
export type UpdateProfile = z.infer<typeof UpdateProfileSchema>;

export const ChangePasswordSchema = z.strictObject({
  current_password: z.string().min(1).max(128),
  new_password: z
    .string()
    .min(8)
    .refine((password) => new TextEncoder().encode(password).length <= 72),
});
export type ChangePassword = z.infer<typeof ChangePasswordSchema>;

/** Convenience for display: "Somchai Prasert". */
export function fullName(user: Pick<User, 'firstName' | 'lastName'>): string {
  return `${user.firstName} ${user.lastName}`.trim();
}
