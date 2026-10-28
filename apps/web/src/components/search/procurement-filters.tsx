'use client';

import { useState, type FormEvent, type MouseEvent } from 'react';
import Link from 'next/link';
import { CircleAlert, ChevronDown, Search, SlidersHorizontal, X } from 'lucide-react';
import { STATUS_LABELS, ProcurementStatus, type TargetPlatform } from '@torfun/types';
import { BudgetRangeFilter } from './budget-range-filter';
import { DateRangeFilter } from './date-range-filter';

import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { PLATFORM_LABELS, PLATFORM_ORDER } from '@/components/company/labels';
import {
  activeFilterCount,
  EMPTY_SEARCH_FILTERS,
  parseSearchFilters,
  searchHref,
  withoutSearchFilter,
  type SearchFilterCriterion,
  type SearchFilterValues,
} from './search-filter-values';

interface ActiveFilter {
  criterion: SearchFilterCriterion;
  label: string;
}

function activeFilters(values: SearchFilterValues): ActiveFilter[] {
  const filters: ActiveFilter[] = [];
  if (values.status) filters.push({ criterion: 'status', label: STATUS_LABELS[values.status] });
  if (values.eBidding)
    filters.push({
      criterion: 'eBidding',
      label: values.eBidding === 'true' ? 'เฉพาะ e-bidding' : 'วิธีอื่นที่ไม่ใช่ e-bidding',
    });
  if (values.deptName)
    filters.push({ criterion: 'deptName', label: `หน่วยงาน: ${values.deptName}` });
  if (values.year) filters.push({ criterion: 'year', label: `ปีงบประมาณ ${values.year}` });
  if (values.outcome) filters.push({ criterion: 'outcome', label: 'มีสรุป TOR แล้ว' });
  if (values.minBudget || values.maxBudget) {
    filters.push({
      criterion: 'budget',
      label: `งบประมาณ ${values.minBudget || 'ไม่กำหนด'}–${values.maxBudget || 'ไม่กำหนด'} บาท`,
    });
  }
  if (values.publishedFrom || values.publishedTo) {
    filters.push({
      criterion: 'published',
      label: `วันที่ประกาศ ${values.publishedFrom || 'ไม่กำหนด'}–${values.publishedTo || 'ไม่กำหนด'}`,
    });
  }
  if (values.minDaysLeft !== '') {
    filters.push({ criterion: 'deadline', label: `เหลืออย่างน้อย ${values.minDaysLeft} วัน` });
  } else if (values.deadlineFrom || values.deadlineTo) {
    filters.push({
      criterion: 'deadline',
      label: `กำหนดส่ง ${values.deadlineFrom || 'ไม่กำหนด'}–${values.deadlineTo || 'ไม่กำหนด'}`,
    });
  }
  if (values.techStack) {
    filters.push({ criterion: 'techStack', label: `เทคโนโลยี: ${values.techStack}` });
  }
  if (values.targetPlatforms.length > 0) {
    filters.push({
      criterion: 'targetPlatforms',
      label: `แพลตฟอร์ม: ${values.targetPlatforms.map((item) => PLATFORM_LABELS[item]).join(', ')}`,
    });
  }
  if (values.industry) {
    filters.push({ criterion: 'industry', label: `ชื่อโครงการ/หน่วยงาน: ${values.industry}` });
  }
  return filters;
}

function Field({
  id,
  name,
  label,
  value,
  type = 'text',
  placeholder,
  hint,
}: {
  id: string;
  name: string;
  label: string;
  value: string;
  type?: 'text' | 'number' | 'date';
  placeholder?: string;
  hint?: string;
}) {
  return (
    <div className="space-y-1.5">
      {hint ? (
        <div className="group/field-hint relative flex items-center gap-1.5">
          <Label htmlFor={id}>{label}</Label>
          <button
            type="button"
            aria-label={`หมายเหตุเกี่ยวกับ${label}`}
            aria-describedby={`${id}-hint`}
            className="text-muted-foreground hover:text-foreground focus-visible:ring-ring/70 inline-flex size-5 shrink-0 items-center justify-center rounded-full outline-none focus-visible:ring-1"
          >
            <CircleAlert aria-hidden="true" className="size-4" />
          </button>
          <span
            id={`${id}-hint`}
            role="tooltip"
            className="border-primary/20 bg-[color-mix(in_oklch,var(--primary)_10%,var(--card))] text-primary pointer-events-none invisible absolute bottom-full left-0 z-20 mb-2 w-56 max-w-full rounded-lg border px-2.5 py-1.5 text-xs font-normal leading-relaxed opacity-0 shadow-sm transition-opacity group-hover/field-hint:visible group-hover/field-hint:opacity-100 group-focus-within/field-hint:visible group-focus-within/field-hint:opacity-100"
          >
            {hint}
          </span>
        </div>
      ) : (
        <Label htmlFor={id}>{label}</Label>
      )}
      <Input
        id={id}
        name={name}
        type={type}
        min={type === 'number' ? 0 : undefined}
        step={type === 'number' ? 1 : undefined}
        defaultValue={value}
        className="h-11"
        placeholder={placeholder}
      />
    </div>
  );
}

const TECHNOLOGY_OPTIONS = [
  'React',
  'MySQL',
  'Python',
  'Java',
  'Node.js',
  'TypeScript',
  'JavaScript',
  'PostgreSQL',
  'MongoDB',
  'PHP',
  'Laravel',
  '.NET',
  'Docker',
  'Kubernetes',
  'AWS',
  'Azure',
  'Google Cloud',
];

function TechnologyFilter({ value }: { value: string }) {
  const [selected, setSelected] = useState(() => {
    const terms = value
      .split(',')
      .map((term) => term.trim())
      .filter(Boolean);
    return terms.filter(
      (term, index) =>
        terms.findIndex((candidate) => candidate.toLowerCase() === term.toLowerCase()) === index,
    );
  });
  const [query, setQuery] = useState('');
  const normalizedQuery = query.trim().toLowerCase();
  const suggestions = TECHNOLOGY_OPTIONS.filter(
    (technology) =>
      !selected.some((term) => term.toLowerCase() === technology.toLowerCase()) &&
      technology.toLowerCase().includes(normalizedQuery),
  );

  function addTerms(raw: string) {
    const additions = raw
      .split(',')
      .map((term) => term.trim())
      .filter(Boolean);
    setSelected((current) => {
      const next = [...current];
      for (const term of additions) {
        if (!next.some((existing) => existing.toLowerCase() === term.toLowerCase())) {
          next.push(term);
        }
      }
      return next;
    });
    setQuery('');
  }

  return (
    <div className="space-y-2">
      <Label htmlFor="tech-stack-search">เทคโนโลยี (ต้องตรงทุกคำ)</Label>
      {selected.length > 0 && (
        <div aria-label="เทคโนโลยีที่เลือก" className="flex flex-wrap gap-2">
          {selected.map((technology) => (
            <span
              key={technology}
              className="bg-primary/10 text-primary inline-flex min-h-7 items-center gap-1 rounded-md px-2 text-xs"
            >
              {technology}
              <button
                type="button"
                aria-label={`ลบเทคโนโลยี ${technology}`}
                onClick={() =>
                  setSelected((current) => current.filter((term) => term !== technology))
                }
                className="hover:bg-primary/15 focus-visible:ring-ring/70 inline-flex size-4 items-center justify-center rounded-full outline-none focus-visible:ring-1"
              >
                <X aria-hidden="true" className="size-3" />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="border-input bg-card overflow-hidden rounded-lg border">
        <div className="relative px-2 py-1.5">
          <Search
            aria-hidden="true"
            className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2"
          />
          <Input
            id="tech-stack-search"
            type="search"
            aria-label="ค้นหาเทคโนโลยี"
            placeholder="ค้นหาเทคโนโลยี"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && query.trim()) {
                event.preventDefault();
                event.stopPropagation();
                addTerms(query);
              }
            }}
            className="h-8 border-0 pl-8 shadow-none focus-visible:ring-0"
          />
        </div>
        <div
          aria-label="ตัวเลือกเทคโนโลยี"
          className="border-border max-h-32 space-y-0.5 overflow-y-auto border-t p-1.5"
        >
          {suggestions.map((technology) => (
            <button
              key={technology}
              type="button"
              aria-label={`เพิ่มเทคโนโลยี ${technology}`}
              onClick={() => addTerms(technology)}
              className="text-muted-foreground hover:bg-muted/60 hover:text-foreground flex min-h-7 w-full items-center rounded-md px-2 text-left text-sm"
            >
              <span aria-hidden="true" className="mr-2">
                +
              </span>
              {technology}
            </button>
          ))}
          {suggestions.length === 0 && (
            <p className="text-muted-foreground px-2 py-1.5 text-xs">
              {query.trim()
                ? `ไม่พบตัวเลือก กด Enter เพื่อเพิ่ม “${query.trim()}”`
                : 'พิมพ์ชื่อเทคโนโลยีเพื่อเพิ่ม'}
            </p>
          )}
        </div>
      </div>
      <input type="hidden" name="techStack" value={selected.join(', ')} />
    </div>
  );
}

const selectClass =
<<<<<<< HEAD
  'border-input bg-card focus-visible:ring-ring/50 h-11 w-full rounded-lg border px-3 text-sm outline-none focus-visible:ring-3';
const DAYS_LEFT_PRESETS = [
  ['7', '7 วันขึ้นไป'],
  ['14', '14 วันขึ้นไป'],
  ['30', '30 วันขึ้นไป'],
  ['60', '60 วันขึ้นไป'],
=======
  'border-input bg-card focus-visible:ring-ring/70 h-11 w-full rounded-lg border px-3 text-sm outline-none focus-visible:ring-1';
const DEADLINE_PRESETS = [
  ['3', 'ภายใน 3 วัน'],
  ['7', 'ภายใน 7 วัน'],
  ['14', 'ภายใน 14 วัน'],
  ['30', 'ภายใน 30 วัน'],
>>>>>>> 13cfc3a (polish uxui of search and filter page)
] as const;

function currentThaiCalendarYear(): number {
  const year = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
  }).format(new Date());
  return Number(year) + 543;
}

export function ProcurementFilters({
  values,
  onApply,
}: {
  values: SearchFilterValues;
  onApply?: (values: SearchFilterValues) => void;
}) {
  const active = activeFilters(values);
  const count = activeFilterCount(values);
  const [open, setOpen] = useState(false);
<<<<<<< HEAD
  const [minDaysLeft, setMinDaysLeft] = useState(values.minDaysLeft);
=======
  const [deadlineDays, setDeadlineDays] = useState(values.deadlineDays);
  const [deadlinePreset, setDeadlinePreset] = useState(() =>
    values.deadlineDays === ''
      ? ''
      : DEADLINE_PRESETS.some(([days]) => days === values.deadlineDays)
        ? values.deadlineDays
        : 'custom',
  );
>>>>>>> 13cfc3a (polish uxui of search and filter page)
  const [status, setStatus] = useState(values.status);
  const [fiscalYearMode, setFiscalYearMode] = useState(values.year ? 'select' : 'all');
  const [selectedFiscalYear, setSelectedFiscalYear] = useState(values.year);
  const [fiscalYearSearch, setFiscalYearSearch] = useState('');
  const [formValues, setFormValues] = useState(values);
  const [formResetKey, setFormResetKey] = useState(0);
  const fiscalYears = Array.from({ length: 4 }, (_, offset) =>
    String(currentThaiCalendarYear() - offset),
  );

  function apply(event: FormEvent<HTMLFormElement>) {
    if (!onApply) return;
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const raw: Record<string, string | string[]> = {};
    for (const [key, entry] of data) {
      if (typeof entry !== 'string' || !entry) continue;
      const previous = raw[key];
      raw[key] = previous ? [...(Array.isArray(previous) ? previous : [previous]), entry] : entry;
    }
    onApply(parseSearchFilters(raw));
    setOpen(false);
  }

  function clear(event: MouseEvent<HTMLAnchorElement>, next: SearchFilterValues) {
    if (!onApply || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    onApply(next);
  }

  function clearForm() {
    const clearedValues = { ...EMPTY_SEARCH_FILTERS, query: values.query };
    setFormValues(clearedValues);
    setDeadlineDays('');
    setDeadlinePreset('');
    setStatus('');
    setFiscalYearMode('all');
    setSelectedFiscalYear('');
    setFiscalYearSearch('');
    setFormResetKey((current) => current + 1);
    onApply?.(clearedValues);
  }

  const fiscalYearOptions = [
    ...new Set([
      ...(selectedFiscalYear && !fiscalYears.includes(selectedFiscalYear)
        ? [selectedFiscalYear]
        : []),
      ...fiscalYears,
    ]),
  ].filter((year) => year.includes(fiscalYearSearch.trim()));

  return (
    <aside
      aria-label="ตัวกรองประกาศ"
      className="bg-card border-border self-start rounded-2xl border shadow-sm lg:sticky lg:top-[calc(var(--header-h)+1rem)] lg:max-h-[calc(100dvh-var(--header-h)-2rem)] lg:overflow-y-auto"
    >
      <div className="flex items-center justify-between gap-3 px-4 py-2 lg:sticky lg:top-0 lg:z-10 lg:border-b lg:border-border lg:bg-card lg:px-5 lg:pt-5 lg:pb-3">
        <div className="hidden min-w-0 items-center gap-2 lg:flex">
          <SlidersHorizontal aria-hidden="true" className="text-primary size-4 shrink-0" />
          <h2 className="font-semibold">ตัวกรองประกาศ</h2>
          {count > 0 && <Badge variant="secondary">{count}</Badge>}
        </div>
        <button
          type="button"
          aria-expanded={open}
          aria-controls="procurement-filter-fields"
          onClick={() => setOpen((current) => !current)}
          className="focus-visible:ring-ring/50 flex min-h-10 min-w-0 flex-1 items-center justify-between rounded-lg px-1 text-sm font-medium outline-none focus-visible:ring-3 lg:hidden"
        >
          <span className="flex items-center gap-2">
            <SlidersHorizontal aria-hidden="true" className="size-4" />
            ตัวกรอง {count > 0 && <Badge variant="secondary">{count}</Badge>}
          </span>
          <ChevronDown
            aria-hidden="true"
            className={cn('size-4 transition-transform', open && 'rotate-180')}
          />
        </button>
      </div>
      <div id="procurement-filter-fields" className={cn(open ? 'block' : 'hidden', 'lg:block')}>
        {active.length > 0 && (
          <div
            aria-label="ตัวกรองที่ใช้งาน"
            className="border-border flex flex-wrap gap-2 border-t px-5 py-4"
          >
            {active.map((filter) => (
              <Link
                key={filter.criterion}
                href={searchHref(withoutSearchFilter(values, filter.criterion))}
                onClick={(event) => clear(event, withoutSearchFilter(values, filter.criterion))}
                aria-label={`ล้างตัวกรอง ${filter.label}`}
                className="bg-primary/10 text-primary hover:bg-primary/15 inline-flex min-h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs transition-colors"
              >
                {filter.label}
                <X aria-hidden="true" className="size-3" />
              </Link>
            ))}
          </div>
        )}
        <form
          key={formResetKey}
          action="/search"
          method="get"
          onSubmit={apply}
          className="space-y-5 px-5 pt-4 pb-5"
        >
          {values.query && <input type="hidden" name="q" value={values.query} />}
          <div className="space-y-1.5">
            <Label htmlFor="procurement-status">ขั้นตอนจัดซื้อจัดจ้าง</Label>
<<<<<<< HEAD
            <select
              id="procurement-status"
              name="status"
              value={status}
              onChange={(event) => {
                setStatus(event.target.value as typeof status);
                if (event.target.value && event.target.value !== 'open') setMinDaysLeft('');
              }}
              className={selectClass}
            >
              <option value="">ทุกขั้นตอน</option>
              {ProcurementStatus.options.map((stage) => (
                <option key={stage} value={stage}>
                  {STATUS_LABELS[stage]}
                </option>
              ))}
            </select>
            <p className="text-muted-foreground text-xs">
              เลือกจัดทำ TOR เพื่อเตรียมตัวก่อนประกาศเชิญชวน
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="e-bidding">วิธีจัดซื้อจัดจ้าง</Label>
            <select
              id="e-bidding"
              name="eBidding"
              defaultValue={values.eBidding}
              className={selectClass}
            >
              <option value="">ทุกวิธีในคลัง</option>
              <option value="true">เฉพาะ e-bidding</option>
              <option value="false">วิธีอื่นที่ไม่ใช่ e-bidding</option>
            </select>
          </div>
          <fieldset className="border-border space-y-3 border-t pt-4">
            <legend className="text-sm font-semibold">เวลาที่เหลือก่อนปิดรับ</legend>
            <div className="grid grid-cols-2 gap-2">
              {DAYS_LEFT_PRESETS.map(([days, label]) => (
                <button
                  key={days}
                  type="button"
                  aria-pressed={minDaysLeft === days}
                  onClick={() => {
                    setMinDaysLeft(minDaysLeft === days ? '' : days);
                    setStatus('open');
                  }}
                  className={cn(
                    'focus-visible:ring-ring/50 min-h-10 rounded-lg border px-2 text-xs transition-colors outline-none focus-visible:ring-3',
                    minDaysLeft === days
                      ? 'bg-primary/10 border-primary text-primary font-medium'
                      : 'border-border hover:bg-muted',
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="min-days-left" className="text-xs">
                เหลืออย่างน้อยกี่วัน (0 = ปิดรับวันนี้ก็ได้)
              </Label>
              <Input
                id="min-days-left"
                name="minDaysLeft"
                type="number"
                min={0}
                max={365}
                step={1}
                placeholder="0–365 วัน"
                value={minDaysLeft}
                onChange={(event) => {
                  setMinDaysLeft(event.target.value);
                  if (event.target.value !== '') setStatus('open');
                }}
                className="h-11"
              />
            </div>
            <p className="text-muted-foreground text-xs">
              เฉพาะประกาศเชิญชวนที่ยังเปิดรับ นับตามวันในประเทศไทย
            </p>
          </fieldset>
=======
            <div className="relative">
              <select
                id="procurement-status"
                name="status"
                value={status}
                onChange={(event) => {
                  setStatus(event.target.value as typeof status);
                  if (event.target.value && event.target.value !== 'invitation') {
                    setDeadlineDays('');
                    setDeadlinePreset('');
                  }
                }}
                className={cn(selectClass, 'appearance-none pr-10')}
              >
                <option value="">ทุกขั้นตอน</option>
                {ProcurementStatus.options.map((stage) => (
                  <option key={stage} value={stage}>
                    {STATUS_LABELS[stage]}
                  </option>
                ))}
              </select>
              <ChevronDown
                aria-hidden="true"
                className="text-muted-foreground pointer-events-none absolute top-1/2 right-4 size-4 -translate-y-1/2"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="e-bidding">วิธีจัดซื้อจัดจ้าง</Label>
            <div className="relative">
              <select
                id="e-bidding"
                name="eBidding"
                defaultValue={formValues.eBidding}
                className={cn(selectClass, 'appearance-none pr-10')}
              >
                <option value="">ทุกวิธีในคลัง</option>
                <option value="true">เฉพาะ e-bidding</option>
                <option value="false">วิธีอื่นที่ไม่ใช่ e-bidding</option>
              </select>
              <ChevronDown
                aria-hidden="true"
                className="text-muted-foreground pointer-events-none absolute top-1/2 right-4 size-4 -translate-y-1/2"
              />
            </div>
          </div>
          <div className="border-border space-y-1.5 border-t pt-4">
            <div className="group/deadline-hint relative flex items-center gap-1.5">
              <p className="text-sm font-medium">เวลาที่เหลือก่อนปิดรับ</p>
              <button
                type="button"
                aria-label="หมายเหตุเกี่ยวกับเวลาที่เหลือก่อนปิดรับ"
                aria-describedby="deadline-days-hint"
                className="text-muted-foreground hover:text-foreground focus-visible:ring-ring/70 inline-flex size-5 shrink-0 items-center justify-center rounded-full outline-none focus-visible:ring-1"
              >
                <CircleAlert aria-hidden="true" className="size-4" />
              </button>
              <span
                id="deadline-days-hint"
                role="tooltip"
                className="border-primary/20 bg-[color-mix(in_oklch,var(--primary)_10%,var(--card))] text-primary pointer-events-none invisible absolute bottom-full left-0 z-20 mb-2 w-56 max-w-full rounded-lg border px-2.5 py-1.5 text-xs font-normal leading-relaxed opacity-0 shadow-sm transition-opacity group-hover/deadline-hint:visible group-hover/deadline-hint:opacity-100 group-focus-within/deadline-hint:visible group-focus-within/deadline-hint:opacity-100"
              >
                เฉพาะประกาศเชิญชวนที่ยังไม่มีผู้ชนะ อ้างอิงวันในประเทศไทย
              </span>
            </div>
            <div className="space-y-3">
              <div className="relative">
                <select
                  id="deadline-preset"
                  aria-label="เวลาที่เหลือก่อนปิดรับ"
                  value={deadlinePreset}
                  onChange={(event) => {
                    const next = event.target.value;
                    setDeadlinePreset(next);
                    if (next === 'custom') {
                      if (DEADLINE_PRESETS.some(([days]) => days === deadlineDays)) {
                        setDeadlineDays('');
                      }
                      setStatus('invitation');
                    } else {
                      setDeadlineDays(next);
                      if (next !== '') setStatus('invitation');
                    }
                  }}
                  className={cn(selectClass, 'appearance-none pr-10')}
                >
                  <option value="">เลือกช่วงเวลา</option>
                  {DEADLINE_PRESETS.map(([days, label]) => (
                    <option key={days} value={days}>
                      {label}
                    </option>
                  ))}
                  <option value="custom">กำหนดเอง</option>
                </select>
                <ChevronDown
                  aria-hidden="true"
                  className="text-muted-foreground pointer-events-none absolute top-1/2 right-4 size-4 -translate-y-1/2"
                />
              </div>
              <div className={cn('space-y-1.5', deadlinePreset !== 'custom' && 'opacity-50')}>
                <Label htmlFor="deadline-days">จำนวนวัน</Label>
                <Input
                  id="deadline-days"
                  name={deadlinePreset === 'custom' ? 'deadlineDays' : undefined}
                  type="number"
                  min={0}
                  max={365}
                  step={1}
                  placeholder="ระบุจำนวนวัน"
                  value={deadlineDays}
                  disabled={deadlinePreset !== 'custom'}
                  onChange={(event) => {
                    setDeadlineDays(event.target.value);
                    if (event.target.value !== '') setStatus('invitation');
                  }}
                  className="h-11"
                />
              </div>
              {deadlinePreset !== 'custom' && (
                <input type="hidden" name="deadlineDays" value={deadlineDays} />
              )}
            </div>
          </div>
          <input type="hidden" name="deadlineMode" value="within" />
>>>>>>> 13cfc3a (polish uxui of search and filter page)
          <DateRangeFilter
            label="ช่วงวันที่ปิดรับข้อเสนอ"
            fromName="deadlineFrom"
            toName="deadlineTo"
            fromLabel="กำหนดส่งตั้งแต่"
            toLabel="กำหนดส่งถึง"
<<<<<<< HEAD
            from={values.deadlineFrom}
            to={values.deadlineTo}
            disabled={minDaysLeft !== ''}
=======
            from={formValues.deadlineFrom}
            to={formValues.deadlineTo}
            disabled={deadlineDays !== ''}
            hint="กำหนดส่งค้นจาก TOR ที่วิเคราะห์สำเร็จแล้วเท่านั้น โปรดตรวจสอบวันปิดรับจากต้นฉบับ"
>>>>>>> 13cfc3a (polish uxui of search and filter page)
          />
          <div className="border-border border-t pt-4">
            <DateRangeFilter
              label="ช่วงวันที่ประกาศ"
              fromName="publishedFrom"
              toName="publishedTo"
              fromLabel="ประกาศตั้งแต่"
              toLabel="ประกาศถึง"
              from={formValues.publishedFrom}
              to={formValues.publishedTo}
            />
          </div>
          <BudgetRangeFilter minBudget={formValues.minBudget} maxBudget={formValues.maxBudget} />
          <div className="space-y-1.5">
            <Label htmlFor="fiscal-year-mode">ปีงบประมาณ (พ.ศ.)</Label>
            <div className="relative">
              <select
                id="fiscal-year-mode"
                value={fiscalYearMode}
                onChange={(event) => {
                  const mode = event.target.value;
                  setFiscalYearMode(mode);
                  if (mode === 'all') {
                    setSelectedFiscalYear('');
                    setFiscalYearSearch('');
                  }
                }}
                className={cn(selectClass, 'appearance-none pr-10')}
              >
                <option value="all">ทุกปีงบประมาณ</option>
                <option value="select">เลือกปีงบประมาณ</option>
              </select>
              <ChevronDown
                aria-hidden="true"
                className="text-muted-foreground pointer-events-none absolute top-1/2 right-4 size-4 -translate-y-1/2"
              />
            </div>
            {fiscalYearMode === 'select' && (
              <div className="space-y-2 rounded-lg border p-2.5">
                <Input
                  type="search"
                  aria-label="ค้นหาปีงบประมาณ"
                  placeholder="ค้นหาปีงบประมาณ"
                  value={fiscalYearSearch}
                  onChange={(event) => setFiscalYearSearch(event.target.value)}
                  className="h-9"
                />
                <div className="max-h-36 space-y-1 overflow-y-auto">
                  {fiscalYearOptions.map((year) => (
                    <label
                      key={year}
                      className="hover:bg-muted/60 flex min-h-8 cursor-pointer items-center gap-2 rounded-md px-1 text-sm"
                    >
                      <input
                        type="checkbox"
                        aria-label={`ปีงบประมาณ ${year}`}
                        checked={selectedFiscalYear === year}
                        onChange={() =>
                          setSelectedFiscalYear((current) => (current === year ? '' : year))
                        }
                        className="accent-primary size-4 shrink-0"
                      />
                      {year}
                    </label>
                  ))}
                  {fiscalYearOptions.length === 0 && (
                    <p className="text-muted-foreground px-1 py-2 text-xs">
                      ไม่พบปีงบประมาณ
                    </p>
                  )}
                </div>
              </div>
            )}
            <input type="hidden" name="year" value={selectedFiscalYear} />
          </div>
          <div className="border-border space-y-5 border-t pt-5">
            <Field
              id="agency"
              name="deptName"
              label="ชื่อหน่วยงาน (ตรงทั้งชื่อ)"
              value={formValues.deptName}
              placeholder="หน่วยงานเจ้าของประกาศ"
            />
            <div className="space-y-1.5">
              <Field
                id="industry"
                name="industry"
                label="คำค้นในชื่อโครงการ"
                value={formValues.industry}
                placeholder="เช่น โรงพยาบาล, โรงเรียน"
                hint="คำค้นไม่ใช่หมวดอุตสาหกรรมที่ยืนยันแล้ว"
              />
            </div>
          </div>
          <div className="border-border space-y-4 border-t pt-4">
            <TechnologyFilter value={formValues.techStack} />
            <fieldset>
              <legend className="text-sm font-medium">แพลตฟอร์มเป้าหมาย (ตรงอย่างน้อยหนึ่ง)</legend>
              <div className="mt-1 grid grid-cols-2 gap-x-3">
                {PLATFORM_ORDER.map((platform: TargetPlatform) => (
                  <label key={platform} className="flex min-h-8 items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      name="targetPlatforms"
                      value={platform}
                      defaultChecked={formValues.targetPlatforms.includes(platform)}
                      className="accent-primary size-4 shrink-0"
                    />
                    {PLATFORM_LABELS[platform]}
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="border-border border-t pt-3">
              <label className="flex min-h-10 items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="outcome"
                  value="tor_analysed"
                  defaultChecked={formValues.outcome === 'tor_analysed'}
                  className="accent-primary size-4"
                />
                มีสรุป TOR แล้ว
              </label>
            </div>
          </div>
          <div className="bg-card sticky bottom-0 -mx-5 -mb-5 grid grid-cols-2 gap-2 border-t px-5 py-4">
            <button
              type="button"
              onClick={clearForm}
              className={cn(
                buttonVariants({ variant: 'secondary' }),
                'h-11 border-border bg-muted/60 text-muted-foreground hover:bg-muted',
              )}
            >
              ล้างตัวกรอง
            </button>
            <button type="submit" className={cn(buttonVariants(), 'h-11')}>
              ใช้ตัวกรอง
            </button>
          </div>
        </form>
      </div>
    </aside>
  );
}
