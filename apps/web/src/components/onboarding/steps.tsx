import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Where an officer is in the flow that turns a new account into one the rest of
 * the product can work with.
 *
 * Three steps, in order. Registering makes the account, then a Company is
 * claimed or created, then the work that Company has delivered is recorded —
 * and only after that does a tender have anything to be compared against. The
 * order is the reason the steps exist: an Experience is written against a
 * company id, so there is nothing to record until step two has an answer.
 */
export const ONBOARDING_STEPS = [
  { id: 'account', label: 'บัญชีผู้ใช้' },
  { id: 'company', label: 'บริษัท' },
  { id: 'experiences', label: 'ผลงาน' },
] as const;

export type OnboardingStepId = (typeof ONBOARDING_STEPS)[number]['id'];

/**
 * `current` is the step being worked on; everything before it is finished.
 *
 * Passing the id rather than an index keeps the caller from having to know the
 * order — the company page says "experiences", not "2".
 */
export function OnboardingSteps({
  current,
  className,
}: {
  current: OnboardingStepId;
  className?: string;
}) {
  const currentIndex = ONBOARDING_STEPS.findIndex((step) => step.id === current);

  return (
    <nav aria-label="ขั้นตอนการตั้งค่าบัญชี" className={className}>
      <ol className="flex items-start">
        {ONBOARDING_STEPS.map((step, index) => {
          const done = index < currentIndex;
          const active = index === currentIndex;
          return (
            <li
              key={step.id}
              className={cn('flex items-start', index > 0 && 'flex-1')}
              aria-current={active ? 'step' : undefined}
            >
              {index > 0 && <Connector filled={done || active} />}
              <div className="flex w-16 shrink-0 flex-col items-center gap-2">
                <span
                  className={cn(
                    'grid size-9 place-items-center rounded-full border text-sm font-semibold transition-colors duration-300',
                    done && 'border-primary/30 bg-primary/15 text-primary',
                    active && 'border-primary bg-primary text-primary-foreground',
                    !done && !active && 'border-border bg-muted text-muted-foreground',
                  )}
                >
                  {done ? (
                    <Check className="size-4" aria-hidden="true" />
                  ) : (
                    <span aria-hidden="true">{index + 1}</span>
                  )}
                  <span className="sr-only">
                    {`ขั้นตอนที่ ${index + 1}: ${step.label}`}
                    {done ? ' (เสร็จแล้ว)' : active ? ' (กำลังทำ)' : ''}
                  </span>
                </span>
                <span
                  className={cn(
                    'text-center text-xs transition-colors duration-300',
                    active ? 'text-foreground font-medium' : 'text-muted-foreground',
                  )}
                >
                  {step.label}
                </span>
              </div>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/**
 * The rail between two steps. The fill is a scaled child rather than an animated
 * width so the transition stays on the compositor.
 */
function Connector({ filled }: { filled: boolean }) {
  return (
    <span className="bg-border mt-[1.0625rem] h-0.5 min-w-6 flex-1 overflow-hidden rounded-full">
      <span
        className={cn(
          'bg-primary block h-full w-full origin-left transition-transform duration-500 ease-out',
          filled ? 'scale-x-100' : 'scale-x-0',
        )}
      />
    </span>
  );
}
