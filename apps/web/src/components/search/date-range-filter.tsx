'use client';

import { useState } from 'react';
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
}: {
  label: string;
  fromName: string;
  toName: string;
  fromLabel: string;
  toLabel: string;
  from: string;
  to: string;
  disabled?: boolean;
}) {
  const [start, setStart] = useState(from);
  const [end, setEnd] = useState(to);

  return (
    <fieldset disabled={disabled} className="min-w-0 space-y-3 disabled:opacity-40">
      <legend className="text-sm font-medium">{label}</legend>
      <div className="space-y-1.5">
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
      <div className="space-y-1.5">
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
    </fieldset>
  );
}
