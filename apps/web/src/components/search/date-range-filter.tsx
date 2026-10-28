'use client';

import { useState } from 'react';
import { CircleAlert } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function DateRangeFilter({
  label,
  fromName,
  toName,
  fromLabel,
  toLabel,
  from,
  to,
  disabled = false,
  hint,
}: {
  label: string;
  fromName: string;
  toName: string;
  fromLabel: string;
  toLabel: string;
  from: string;
  to: string;
  disabled?: boolean;
  hint?: string;
}) {
  const [start, setStart] = useState(from);
  const [end, setEnd] = useState(to);

  return (
    <fieldset
      disabled={disabled}
      className="min-w-0 space-y-3 @container disabled:opacity-40"
    >
      <legend className="text-sm font-medium">
        <span className="group/date-range-hint relative inline-flex items-center gap-1.5">
          {label}
          {hint && (
            <>
              <button
                type="button"
                aria-label={`หมายเหตุเกี่ยวกับ${label}`}
                aria-describedby={`${fromName}-hint`}
                className="text-muted-foreground hover:text-foreground focus-visible:ring-ring/70 inline-flex size-5 shrink-0 items-center justify-center rounded-full outline-none focus-visible:ring-1"
              >
                <CircleAlert aria-hidden="true" className="size-4" />
              </button>
              <span
                id={`${fromName}-hint`}
                role="tooltip"
                className="border-primary/20 bg-[color-mix(in_oklch,var(--primary)_10%,var(--card))] text-primary pointer-events-none invisible absolute bottom-full left-0 z-20 mb-2 w-56 max-w-full rounded-lg border px-2.5 py-1.5 text-xs font-normal leading-relaxed opacity-0 shadow-sm transition-opacity group-hover/date-range-hint:visible group-hover/date-range-hint:opacity-100 group-focus-within/date-range-hint:visible group-focus-within/date-range-hint:opacity-100"
              >
                {hint}
              </span>
            </>
          )}
        </span>
      </legend>
      <div className="grid grid-cols-1 gap-3 @min-[16rem]:grid-cols-2">
        <div className="min-w-0 space-y-1.5">
          <Label htmlFor={fromName} className="text-xs">
            {fromLabel}
          </Label>
          <Input
            id={fromName}
            name={fromName}
            type="date"
            value={start}
            max={end || undefined}
            onChange={(event) => setStart(event.target.value)}
            className="h-11"
          />
        </div>
        <div className="min-w-0 space-y-1.5">
          <Label htmlFor={toName} className="text-xs">
            {toLabel}
          </Label>
          <Input
            id={toName}
            name={toName}
            type="date"
            value={end}
            min={start || undefined}
            onChange={(event) => setEnd(event.target.value)}
            className="h-11"
          />
        </div>
      </div>
    </fieldset>
  );
}
