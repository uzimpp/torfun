import type { ComponentProps } from 'react';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { FLOW_FIELD, FLOW_FIELD_GROUP } from './controls';

/**
 * One labelled input in the flow: label above, field, then a hint.
 *
 * The three pages each hand-wrote the same twelve utility classes onto every
 * input, which is how they ended up with three different focus rings and two
 * different heights. Everything about the shape of a field is decided here.
 */
export function FlowField({
  id,
  label,
  hint,
  className,
  ...props
}: ComponentProps<typeof Input> & { id: string; label: string; hint?: string }) {
  const hintId = hint ? `${id}-hint` : undefined;
  return (
    <div className={FLOW_FIELD_GROUP}>
      <Label htmlFor={id} className="text-foreground text-sm font-medium">
        {label}
      </Label>
      <Input id={id} aria-describedby={hintId} className={cn(FLOW_FIELD, className)} {...props} />
      {hint ? (
        <p id={hintId} className="text-muted-foreground text-xs">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/** The form-level failure message. One shape, so it reads the same everywhere. */
export function FlowError({ children }: { children: string }) {
  return (
    <div
      role="alert"
      className="bg-destructive/10 text-destructive rounded-lg px-4 py-3 text-sm leading-relaxed"
    >
      {children}
    </div>
  );
}
