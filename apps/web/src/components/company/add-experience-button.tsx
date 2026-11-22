'use client';

import { useId } from 'react';
import { PlusIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { FLOW_ACTION } from '@/components/onboarding/controls';
import { cn } from '@/lib/utils';

/**
 * Adds a piece of past work — and, until the Company exists on the server, says
 * so instead of working.
 *
 * Deliberately **not** the `disabled` attribute. A disabled element receives no
 * pointer events at all, so `cursor: not-allowed` never renders and the reason
 * the button does nothing stays a mystery; the shadcn base class
 * `disabled:pointer-events-none` makes that doubly true. `aria-disabled` keeps
 * the button in the tab order, lets a screen reader announce it as unavailable,
 * leaves hover working so the blocked cursor shows, and the click is swallowed
 * here.
 *
 * "Saved on the server" rather than "typed into the field" is the real
 * condition: an Experience is written against a company id, and there is no id
 * until the API has one.
 */
export function AddExperienceButton({
  available,
  onAdd,
}: {
  /** True once the Company has actually been saved, not merely typed. */
  available: boolean;
  onAdd: () => void;
}) {
  const hintId = useId();

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button
        type="button"
        aria-disabled={!available}
        aria-describedby={available ? undefined : hintId}
        className={cn(FLOW_ACTION, !available && 'cursor-not-allowed opacity-50')}
        onClick={(event) => {
          if (!available) {
            event.preventDefault();
            return;
          }
          onAdd();
        }}
      >
        <PlusIcon />
        เพิ่มผลงาน
      </Button>
      {available ? null : (
        <p id={hintId} className="text-muted-foreground text-xs">
          บันทึกบริษัทของคุณก่อน จึงจะเพิ่มผลงานได้
        </p>
      )}
    </div>
  );
}
