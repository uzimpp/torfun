import { redirect } from 'next/navigation';

/**
 * `/signup` is an alias kept for links written before `/register` was the one
 * registration route. Self-registration has a single form, because it also
 * claims a Company (ADR 0008) — a second one would drift from it.
 */
export default function SignupPage() {
  redirect('/register');
}
