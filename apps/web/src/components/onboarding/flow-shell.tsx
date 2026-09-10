import type { ReactNode } from 'react';
import Link from 'next/link';
import { ScanLine } from 'lucide-react';

import { cn } from '@/lib/utils';
import { OnboardingSteps, type OnboardingStepId } from './steps';

/**
 * The frame every page in the sign-in and sign-up flow sits in.
 *
 * These pages have no navbar and no sidebar, so this is the only thing telling a
 * person where they are. It exists because the three of them each grew their own
 * width, background, heading size and card treatment, and looked like three
 * different products as a result.
 *
 * `step` is omitted for signing in, which is not part of the flow — a returning
 * officer is not on their way through registration and should not be shown a
 * progress bar that says they are.
 */
export function FlowShell({
  step,
  title,
  description,
  width = 'narrow',
  children,
  footer,
}: {
  step?: OnboardingStepId;
  title: string;
  description: string;
  /** `wide` is for the company step, which holds lists rather than a short form. */
  width?: 'narrow' | 'wide';
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <main className="landing-grid bg-background flex flex-1 flex-col items-center px-4 py-10 sm:px-6 sm:py-14">
      <div className={cn('w-full', width === 'narrow' ? 'max-w-md' : 'max-w-3xl')}>
        <Link
          href="/"
          aria-label="Torfun หน้าแรก"
          className="text-primary focus-visible:outline-ring mb-8 inline-flex items-center gap-2 text-xl font-semibold tracking-tight focus-visible:outline-2"
        >
          <ScanLine className="size-6" aria-hidden="true" />
          Torfun
        </Link>

        {step ? <OnboardingSteps current={step} className="mb-10" /> : null}

        {/* A short form gets a card to sit in. The wide step is already built
            from cards, so giving it another one would nest a panel in a panel. */}
        <div
          className={cn(
            width === 'narrow' && 'bg-card border-border rounded-2xl border p-6 shadow-sm sm:p-8',
          )}
        >
          <header className="mb-8">
            <h1 className="text-foreground text-2xl font-semibold tracking-tight sm:text-3xl">
              {title}
            </h1>
            <p className="text-muted-foreground mt-2 max-w-[60ch] text-sm leading-relaxed">
              {description}
            </p>
          </header>

          {children}
        </div>

        {footer ? (
          <div className="text-muted-foreground mt-6 text-center text-sm">{footer}</div>
        ) : null}
      </div>
    </main>
  );
}
