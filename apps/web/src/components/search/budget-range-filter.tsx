'use client';

import { useState } from 'react';
import { Slider } from '@base-ui/react/slider';

const STEP = 1_000;
const DEFAULT_MAX = 100_000_000;
const baht = new Intl.NumberFormat('th-TH');
const formatBudget = (value: number) => `${baht.format(value)} บาท`;
const validBudget = (value: string) =>
  value !== '' && Number.isFinite(Number(value)) && Number(value) >= 0 ? value : '';

/** Two bounds on one track; the rightmost position leaves the budget uncapped. */
export function BudgetRangeFilter({
  minBudget,
  maxBudget,
}: {
  minBudget: string;
  maxBudget: string;
}) {
  const [minimum, setMinimum] = useState(validBudget(minBudget));
  const [maximum, setMaximum] = useState(validBudget(maxBudget));
  // Include existing URL bounds without turning a bookmarked upper bound into "unlimited".
  const [ceiling] = useState(() =>
    Math.max(
      DEFAULT_MAX,
      Math.ceil(Math.max(Number(minimum), Number(maximum)) / STEP) * STEP + STEP,
    ),
  );
  const values = [Number(minimum || 0), maximum === '' ? ceiling : Number(maximum)];

  return (
    <fieldset className="border-border min-w-0 space-y-3 border-t pt-4">
      <legend className="text-sm font-semibold">งบประมาณ (บาท)</legend>
      <div className="grid grid-cols-2 gap-3 text-xs tabular-nums">
        <div className="space-y-1">
          <span className="text-muted-foreground">ต่ำสุด</span>
          <p className="font-medium">{formatBudget(Number(minimum || 0))}</p>
        </div>
        <div className="space-y-1 text-end">
          <span className="text-muted-foreground">สูงสุด</span>
          <p className="font-medium">
            {maximum === '' ? 'ไม่จำกัด' : formatBudget(Number(maximum))}
          </p>
        </div>
      </div>
      <Slider.Root
        min={0}
        max={ceiling}
        step={STEP}
        largeStep={100_000}
        value={values}
        thumbCollisionBehavior="none"
        onValueChange={(next, details) => {
          if (details.activeThumbIndex === 0) setMinimum(next[0] === 0 ? '' : String(next[0]));
          if (details.activeThumbIndex === 1)
            setMaximum(next[1] === ceiling ? '' : String(next[1]));
        }}
      >
        <Slider.Control className="flex h-11 w-full touch-none items-center px-2">
          <Slider.Track className="bg-muted relative h-1.5 w-full rounded-full">
            <Slider.Indicator className="bg-primary rounded-full" />
            {['งบประมาณต่ำสุด (บาท)', 'งบประมาณสูงสุด (บาท)'].map((label, index) => (
              <Slider.Thumb
                key={label}
                index={index}
                aria-label={label}
                getAriaValueText={(_, value) =>
                  index === 1 && value === ceiling ? 'ไม่จำกัดงบประมาณสูงสุด' : formatBudget(value)
                }
                className="border-primary bg-card focus-visible:ring-ring/50 block size-5 rounded-full border-2 outline-none focus-visible:ring-4"
              />
            ))}
          </Slider.Track>
        </Slider.Control>
      </Slider.Root>
      <input type="hidden" name="minBudget" value={minimum} />
      <input type="hidden" name="maxBudget" value={maximum} />
      <p className="text-muted-foreground text-xs">
        เลื่อนเพื่อเลือกช่วงงบประมาณ · ขวาสุด = ไม่จำกัด
      </p>
    </fieldset>
  );
}
