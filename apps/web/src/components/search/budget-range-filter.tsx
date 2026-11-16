'use client';

import { useState } from 'react';
import { CircleAlert } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const validBudget = (value: string) =>
  value !== '' && Number.isFinite(Number(value)) && Number(value) >= 0 ? value : '';

export function BudgetRangeFilter({
  minBudget,
  maxBudget,
}: {
  minBudget: string;
  maxBudget: string;
}) {
  const [minimum, setMinimum] = useState(validBudget(minBudget));
  const [maximum, setMaximum] = useState(validBudget(maxBudget));

  return (
    <div className="border-border min-w-0 space-y-3 border-t pt-4">
      <div className="group/budget-hint relative flex items-center gap-1.5">
        <p className="text-sm font-medium">งบประมาณ (บาท)</p>
        <button
          type="button"
          aria-label="หมายเหตุเกี่ยวกับงบประมาณ"
          aria-describedby="budget-hint"
          className="text-muted-foreground hover:text-foreground focus-visible:ring-ring/70 inline-flex size-5 shrink-0 items-center justify-center rounded-full outline-none focus-visible:ring-1"
        >
          <CircleAlert aria-hidden="true" className="size-4" />
        </button>
        <span
          id="budget-hint"
          role="tooltip"
          className="border-primary/20 bg-[color-mix(in_oklch,var(--primary)_10%,var(--card))] text-primary pointer-events-none invisible absolute bottom-full left-0 z-20 mb-2 w-56 max-w-full rounded-lg border px-2.5 py-1.5 text-xs font-normal leading-relaxed opacity-0 shadow-sm transition-opacity group-hover/budget-hint:visible group-hover/budget-hint:opacity-100 group-focus-within/budget-hint:visible group-focus-within/budget-hint:opacity-100"
        >
          เว้นช่องสูงสุดว่างไว้ - ไม่จำกัดงบประมาณสูงสุด
        </span>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="min-w-0 space-y-1.5">
          <Label htmlFor="min-budget" className="text-xs">
            ขั้นต่ำ
          </Label>
          <Input
            id="min-budget"
            name="minBudget"
            type="number"
            min={0}
            step={1}
            placeholder="เช่น 100,000"
            value={minimum}
            onChange={(event) => setMinimum(validBudget(event.target.value))}
            className="h-11"
          />
        </div>
        <div className="min-w-0 space-y-1.5">
          <Label htmlFor="max-budget" className="text-xs">
            สูงสุด
          </Label>
          <Input
            id="max-budget"
            name="maxBudget"
            type="number"
            min={0}
            step={1}
            placeholder="เช่น 5,000,000"
            value={maximum}
            onChange={(event) => setMaximum(validBudget(event.target.value))}
            className="h-11"
          />
        </div>
      </div>
    </div>
  );
}
