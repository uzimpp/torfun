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
   * The Company owns its own name (ADR-0007), so a user document carries no
   * second copy of it.
   */
  companyId: z.string().nullable(),
  /**
   * A request to join a Company that no manager has answered yet. Grants
   * nothing: every company-scoped read keys on `companyId`, which an approval
   * sets. One at a time; asking again replaces it.
   */
  joinRequest: z
    .object({ companyId: z.string(), requestedAt: z.coerce.date() })
    .nullable()
    .optional(),
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

/** bcrypt reads only the first 72 bytes of its input (ASVS V6.2.8). */
export const PASSWORD_MAX_BYTES = 72;

/**
 * A password the user is choosing: at sign-up and at password change. Bounded
 * in UTF-8 bytes, not characters, so a longer password is refused instead of
 * being silently cut short by bcrypt.
 */
export const NewPasswordSchema = z
  .string()
  .min(8)
  .refine((password) => new TextEncoder().encode(password).length <= PASSWORD_MAX_BYTES, {
    message: `Password must be at most ${PASSWORD_MAX_BYTES} bytes`,
  });

export const ChangePasswordSchema = z.strictObject({
  current_password: z.string().min(1).max(128),
  new_password: NewPasswordSchema,
});
export type ChangePassword = z.infer<typeof ChangePasswordSchema>;

/** Convenience for display: "Somchai Prasert". */
export function fullName(user: Pick<User, 'firstName' | 'lastName'>): string {
  return `${user.firstName} ${user.lastName}`.trim();
}
