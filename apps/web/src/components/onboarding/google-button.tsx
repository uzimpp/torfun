'use client';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { api_url as apiUrl } from '@/lib/config';
import { FLOW_ACTION } from './controls';

/**
 * The one Google control, on both the sign-in and the sign-up page.
 *
 * It was previously only on sign-in, and said "sign in" there — but the first
 * use of it creates the account (see `loginWithGoogle` on the API). So the
 * button was quietly the sign-up path while the page that was actually called
 * "sign up" never mentioned it. Both pages now offer it, and each says which of
 * the two is about to happen.
 */
export function GoogleButton({ intent }: { intent: 'signin' | 'signup' }) {
  return (
    <Button
      type="button"
      variant="outline"
      onClick={() => window.location.assign(new URL('/api/auth/google', apiUrl).toString())}
      className={cn(FLOW_ACTION, 'w-full gap-3 font-medium')}
    >
      <GoogleMark />
      {intent === 'signup' ? 'สมัครด้วยบัญชี Google' : 'เข้าสู่ระบบด้วย Google'}
    </Button>
  );
}

function GoogleMark() {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 24 24"
      className="size-5"
      fill="currentColor"
    >
      <path d="M21.6 12.23c0-.71-.06-1.39-.18-2.05H12v3.88h5.38a4.6 4.6 0 0 1-2 3.02v2.51h3.24c1.9-1.75 2.98-4.33 2.98-7.36ZM12 22c2.7 0 4.96-.9 6.62-2.41l-3.24-2.51c-.9.6-2.04.96-3.38.96-2.6 0-4.8-1.76-5.59-4.12H3.07v2.59A10 10 0 0 0 12 22ZM6.41 13.92a6 6 0 0 1 0-3.84V7.49H3.07a10 10 0 0 0 0 9.02l3.34-2.59ZM12 5.96c1.47 0 2.79.51 3.83 1.51l2.87-2.87A9.6 9.6 0 0 0 12 2a10 10 0 0 0-8.93 5.49l3.34 2.59C7.2 7.72 9.4 5.96 12 5.96Z" />
    </svg>
  );
}

/** A labelled rule, so both pages separate the two routes in the same way. */
export function OrDivider({ label = 'หรือ' }: { label?: string }) {
  return (
    <div className="my-6 flex items-center gap-4">
      <span className="bg-border h-px flex-1" />
      <span className="text-muted-foreground text-xs">{label}</span>
      <span className="bg-border h-px flex-1" />
    </div>
  );
}
