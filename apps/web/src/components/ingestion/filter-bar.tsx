'use client';

import type { IngestionState } from '@torfun/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { FilterValues } from './use-ingestion-data';

const STATES: IngestionState[] = ['Queued', 'Processing', 'Completed', 'Failed'];

/** Native select, styled to match the Input primitive. */
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
  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-muted-foreground text-xs">{label}</Label>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="border-input focus-visible:border-ring focus-visible:ring-ring/50 h-9 rounded-md border bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:ring-[3px]"
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
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">ตัวกรอง</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-wrap items-end gap-4">
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
          label="สถานะ"
          value={values.state}
          onChange={(state) => onChange({ state })}
          options={[ALL, ...STATES.map((s) => ({ value: s, label: s }))]}
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
        <Select
          label="วิธีจัดหา"
          value={values.eBidding}
          onChange={(eBidding) => onChange({ eBidding })}
          options={[
            ALL,
            { value: 'true', label: 'e-bidding เท่านั้น' },
            { value: 'false', label: 'ไม่ใช่ e-bidding' },
          ]}
        />
      </CardContent>
    </Card>
  );
}
