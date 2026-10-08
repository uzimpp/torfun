'use client';

import { useId } from 'react';
import {
  IngestionOutcome,
  IngestionState,
  OUTCOME_LABELS,
  ProcurementStatus,
  STATE_LABELS,
  STATUS_LABELS,
} from '@torfun/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { EMPTY_FILTERS, type FilterValues } from './use-ingestion-data';

/**
 * Native select, styled to match the Input primitive.
 *
 * Its label is tied to it with an id, so a screen reader announces the name and
 * a click on the label focuses the control.
 */
function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  const id = useId();
  return (
    <div className="flex min-w-40 flex-1 flex-col gap-1.5 sm:flex-none">
      <Label htmlFor={id} className="text-muted-foreground text-xs">
        {label}
      </Label>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="border-input focus-visible:border-ring focus-visible:ring-ring/50 h-10 rounded-md border bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:ring-[3px]"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

const ALL = { value: '', label: 'ทั้งหมด' };

export function FilterBar({
  values,
  onChange,
  agencies,
  years,
}: {
  values: FilterValues;
  /** Applies a partial change; the caller resets pagination. */
  onChange: (patch: Partial<FilterValues>) => void;
  agencies: string[];
  years: number[];
}) {
  const active = (Object.keys(EMPTY_FILTERS) as Array<keyof FilterValues>).some(
    (key) => values[key] !== EMPTY_FILTERS[key],
  );

  return (
    <Card>
      <CardContent className="flex flex-wrap items-end gap-4 py-5">
        <div className="flex min-w-56 flex-1 flex-col gap-1.5">
          <Label htmlFor="search" className="text-muted-foreground text-xs">
            ค้นหาชื่อโครงการ / รหัส
          </Label>
          <Input
            id="search"
            value={values.query}
            placeholder="เช่น ระบบสารสนเทศ"
            onChange={(event) => onChange({ query: event.target.value })}
          />
        </div>
        <Select
          label="สถานะการประมวลผล"
          value={values.state}
          onChange={(state) => onChange({ state })}
          options={[
            ALL,
            ...IngestionState.options.map((s) => ({ value: s, label: STATE_LABELS[s] })),
          ]}
        />
        <Select
          label="ผลการประมวลผล"
          value={values.outcome}
          onChange={(outcome) => onChange({ outcome })}
          options={[
            ALL,
            ...IngestionOutcome.options.map((o) => ({ value: o, label: OUTCOME_LABELS[o] })),
          ]}
        />
        <Select
          label="สถานะโครงการ"
          value={values.status}
          onChange={(status) => onChange({ status })}
          options={[
            ALL,
            ...ProcurementStatus.options.map((s) => ({ value: s, label: STATUS_LABELS[s] })),
          ]}
        />
        <Select
          label="หน่วยงาน"
          value={values.agency}
          onChange={(agency) => onChange({ agency })}
          options={[ALL, ...agencies.map((a) => ({ value: a, label: a }))]}
        />
        <Select
          label="ปีงบประมาณ"
          value={values.year}
          onChange={(year) => onChange({ year })}
          options={[ALL, ...years.map((y) => ({ value: String(y), label: String(y) }))]}
        />
        {active ? (
          <Button variant="ghost" className="min-h-10" onClick={() => onChange(EMPTY_FILTERS)}>
            ล้างตัวกรอง
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}
