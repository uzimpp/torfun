'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { Search, SlidersHorizontal, X } from 'lucide-react';
import {
  IngestionOutcome,
  IngestionState,
  OUTCOME_LABELS,
  ProcurementStatus,
  STATE_LABELS,
  STATUS_LABELS,
} from '@torfun/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import {
  EMPTY_PROCUREMENT_FILTERS,
  type ProcurementListFilters,
} from './procurement-filter-values';

export const SEARCH_SETTLE_MS = 300;

type Option = { value: string; label: string };

const STATE_OPTIONS: Option[] = IngestionState.options.map((value) => ({
  value,
  label: STATE_LABELS[value],
}));
const OUTCOME_OPTIONS: Option[] = IngestionOutcome.options.map((value) => ({
  value,
  label: OUTCOME_LABELS[value],
}));
const STATUS_OPTIONS: Option[] = ProcurementStatus.options.map((value) => ({
  value,
  label: STATUS_LABELS[value],
}));

const FIELD_LABELS = {
  q: 'ค้นหา',
  state: 'การประมวลผล',
  outcome: 'ผลการประมวลผล',
  status: 'สถานะโครงการ',
  agency: 'หน่วยงาน',
  year: 'ปีงบประมาณ',
} as const;

type ChipKey = keyof typeof FIELD_LABELS;

function chipValue(key: ChipKey, values: ProcurementListFilters): string {
  switch (key) {
    case 'state':
      return values.state ? STATE_LABELS[values.state] : '';
    case 'outcome':
      return values.outcome ? OUTCOME_LABELS[values.outcome] : '';
    case 'status':
      return values.status ? STATUS_LABELS[values.status] : '';
    default:
      return values[key];
  }
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
  className,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Option[];
  className?: string;
}) {
  const id = useId();
  return (
    <div className={cn('flex min-w-0 flex-col gap-1', className)}>
      <label htmlFor={id} className="text-muted-foreground text-xs">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="border-input focus-visible:border-ring focus-visible:ring-ring/50 bg-background h-9 w-full min-w-0 truncate rounded-md border px-2.5 text-sm outline-none focus-visible:ring-[3px]"
      >
        <option value="">ทั้งหมด</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

/**
 * Search, the three filters an administrator reaches for most, and the rest
 * behind a popover. The search box writes its words once typing settles, so
 * the URL is not rewritten on every keystroke.
 */
export function ProcurementFilterRow({
  values,
  onChange,
  agencies,
  budgetYears,
}: {
  values: ProcurementListFilters;
  onChange: (patch: Partial<ProcurementListFilters>) => void;
  agencies: string[];
  budgetYears: number[];
}) {
  const searchId = useId();
  const [draft, setDraft] = useState(values.q);
  const [seenQ, setSeenQ] = useState(values.q);
  if (values.q !== seenQ) {
    setSeenQ(values.q);
    setDraft(values.q);
  }

  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });

  useEffect(() => {
    const q = draft.trim();
    if (q === values.q) return;
    const timer = setTimeout(() => onChangeRef.current({ q }), SEARCH_SETTLE_MS);
    return () => clearTimeout(timer);
  }, [draft, values.q]);

  const chips = (Object.keys(FIELD_LABELS) as ChipKey[]).filter((key) => values[key] !== '');
  const extraCount = (values.agency ? 1 : 0) + (values.year ? 1 : 0);
  const yearOptions = budgetYears.map((year) => ({ value: String(year), label: String(year) }));
  if (values.year && !yearOptions.some((option) => option.value === values.year)) {
    yearOptions.unshift({ value: values.year, label: values.year });
  }
  const agencyOptions = agencies.map((agency) => ({ value: agency, label: agency }));
  if (values.agency && !agencies.includes(values.agency)) {
    agencyOptions.unshift({ value: values.agency, label: values.agency });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 items-end gap-3 sm:grid-cols-3 lg:flex lg:flex-nowrap">
        <div className="col-span-2 flex min-w-0 flex-col gap-1 sm:col-span-3 lg:flex-[2]">
          <label htmlFor={searchId} className="text-muted-foreground text-xs">
            ค้นหาชื่อโครงการหรือรหัส
          </label>
          <div className="relative">
            <Search
              aria-hidden="true"
              className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2"
            />
            <Input
              id={searchId}
              type="search"
              value={draft}
              placeholder="เช่น ระบบสารสนเทศ หรือ 6701…"
              onChange={(event) => setDraft(event.target.value)}
              className="h-9 pl-8"
            />
          </div>
        </div>
        <FilterSelect
          label={FIELD_LABELS.state}
          value={values.state}
          options={STATE_OPTIONS}
          onChange={(state) => onChange({ state: state as ProcurementListFilters['state'] })}
          className="lg:flex-1"
        />
        <FilterSelect
          label={FIELD_LABELS.outcome}
          value={values.outcome}
          options={OUTCOME_OPTIONS}
          onChange={(outcome) =>
            onChange({ outcome: outcome as ProcurementListFilters['outcome'] })
          }
          className="lg:flex-1"
        />
        <FilterSelect
          label={FIELD_LABELS.status}
          value={values.status}
          options={STATUS_OPTIONS}
          onChange={(status) => onChange({ status: status as ProcurementListFilters['status'] })}
          className="lg:flex-1"
        />
        <Popover>
          <PopoverTrigger
            render={
              <Button
                variant="outline"
                className="h-9 justify-center gap-2 active:translate-y-px sm:col-span-3 lg:col-span-1 lg:shrink-0"
              />
            }
          >
            <SlidersHorizontal aria-hidden="true" />
            ตัวกรองเพิ่มเติม
            {extraCount > 0 ? (
              <span className="bg-primary/10 text-primary rounded-full px-1.5 font-mono text-xs tabular-nums">
                {extraCount}
              </span>
            ) : null}
          </PopoverTrigger>
          <PopoverContent align="end" className="w-80 max-w-[calc(100vw-2rem)] gap-3 p-3">
            <FilterSelect
              label={FIELD_LABELS.agency}
              value={values.agency}
              options={agencyOptions}
              onChange={(agency) => onChange({ agency })}
            />
            <FilterSelect
              label={FIELD_LABELS.year}
              value={values.year}
              options={yearOptions}
              onChange={(year) => onChange({ year })}
            />
          </PopoverContent>
        </Popover>
      </div>

      {chips.length > 0 ? (
        <ul aria-label="ตัวกรองที่ใช้อยู่" className="flex flex-wrap items-center gap-2">
          {chips.map((key) => {
            const text = `${FIELD_LABELS[key]}: ${chipValue(key, values)}`;
            return (
              <li key={key} className="min-w-0">
                <button
                  type="button"
                  aria-label={`ล้างตัวกรอง ${text}`}
                  onClick={() => {
                    if (key === 'q') setDraft('');
                    onChange({ [key]: '' });
                  }}
                  className="bg-muted hover:bg-muted/70 focus-visible:ring-ring/50 inline-flex max-w-full items-center gap-1.5 rounded-full py-1 pr-2 pl-3 text-xs outline-none focus-visible:ring-[3px] active:translate-y-px"
                >
                  <span className="min-w-0 break-words">{text}</span>
                  <X aria-hidden="true" className="size-3.5 shrink-0" />
                </button>
              </li>
            );
          })}
          <li>
            <Button
              variant="link"
              size="sm"
              className="h-auto px-1 text-xs"
              onClick={() => {
                setDraft('');
                onChange(EMPTY_PROCUREMENT_FILTERS);
              }}
            >
              ล้างทั้งหมด
            </Button>
          </li>
        </ul>
      ) : null}
    </div>
  );
}
