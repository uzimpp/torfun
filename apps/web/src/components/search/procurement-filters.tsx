'use client';

import { useState, type FormEvent, type MouseEvent } from 'react';
import Link from 'next/link';
import { ChevronDown, SlidersHorizontal, X } from 'lucide-react';
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
}: {
  id: string;
  name: string;
  label: string;
  value: string;
  type?: 'text' | 'number' | 'date';
  placeholder?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
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

const selectClass =
  'border-input bg-card focus-visible:ring-ring/50 h-11 w-full rounded-lg border px-3 text-sm outline-none focus-visible:ring-3';
const DAYS_LEFT_PRESETS = [
  ['7', '7 วันขึ้นไป'],
  ['14', '14 วันขึ้นไป'],
  ['30', '30 วันขึ้นไป'],
  ['60', '60 วันขึ้นไป'],
] as const;

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
  const [minDaysLeft, setMinDaysLeft] = useState(values.minDaysLeft);
  const [status, setStatus] = useState(values.status);

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

  return (
    <aside
      aria-label="ตัวกรองประกาศ"
      className="bg-card border-border self-start rounded-2xl border lg:sticky lg:top-[calc(var(--header-h)+1rem)] lg:max-h-[calc(100dvh-var(--header-h)-2rem)] lg:overflow-y-auto"
    >
      <div className="hidden items-center gap-2 px-5 pt-5 lg:flex">
        <SlidersHorizontal aria-hidden="true" className="text-primary size-4" />
        <h2 className="font-semibold">ตัวกรองประกาศ</h2>
        {count > 0 && <Badge variant="secondary">{count}</Badge>}
      </div>
      <button
        type="button"
        aria-expanded={open}
        aria-controls="procurement-filter-fields"
        onClick={() => setOpen((current) => !current)}
        className="focus-visible:ring-ring/50 flex min-h-12 w-full items-center justify-between rounded-2xl px-4 text-sm font-medium outline-none focus-visible:ring-3 lg:hidden"
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
      <div id="procurement-filter-fields" className={cn(open ? 'block' : 'hidden', 'lg:block')}>
        {active.length > 0 && (
          <div aria-label="ตัวกรองที่ใช้งาน" className="flex flex-wrap gap-2 px-5 pt-4">
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
            <Link
              href={values.query ? `/search?q=${encodeURIComponent(values.query)}` : '/search'}
              onClick={(event) => clear(event, { ...EMPTY_SEARCH_FILTERS, query: values.query })}
              className="text-muted-foreground hover:text-foreground flex min-h-8 items-center text-xs underline underline-offset-4"
            >
              ล้างทั้งหมด
            </Link>
          </div>
        )}
        <form action="/search" method="get" onSubmit={apply} className="space-y-5 p-5">
          {values.query && <input type="hidden" name="q" value={values.query} />}
          <div className="space-y-1.5">
            <Label htmlFor="procurement-status">ขั้นตอนจัดซื้อจัดจ้าง</Label>
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
          <DateRangeFilter
            label="ช่วงวันที่ปิดรับข้อเสนอ"
            fromName="deadlineFrom"
            toName="deadlineTo"
            fromLabel="กำหนดส่งตั้งแต่"
            toLabel="กำหนดส่งถึง"
            from={values.deadlineFrom}
            to={values.deadlineTo}
            disabled={minDaysLeft !== ''}
          />
          <p className="text-muted-foreground text-xs leading-relaxed">
            กำหนดส่ง เทคโนโลยี และแพลตฟอร์มค้นจาก TOR ที่วิเคราะห์สำเร็จแล้วเท่านั้น
            โปรดตรวจสอบวันปิดรับจากต้นฉบับ
          </p>
          <div className="border-border border-t pt-4">
            <DateRangeFilter
              label="ช่วงวันที่ประกาศ"
              fromName="publishedFrom"
              toName="publishedTo"
              fromLabel="ประกาศตั้งแต่"
              toLabel="ประกาศถึง"
              from={values.publishedFrom}
              to={values.publishedTo}
            />
          </div>
          <BudgetRangeFilter minBudget={values.minBudget} maxBudget={values.maxBudget} />
          <Field
            id="agency"
            name="deptName"
            label="ชื่อหน่วยงาน (ตรงทั้งชื่อ)"
            value={values.deptName}
            placeholder="หน่วยงานเจ้าของประกาศ"
          />
          <Field
            id="industry"
            name="industry"
            label="คำค้นในชื่อโครงการ / ชื่อหน่วยงาน"
            value={values.industry}
            placeholder="เช่น โรงพยาบาล, โรงเรียน"
          />
          <p className="text-muted-foreground text-xs">คำค้นไม่ใช่หมวดอุตสาหกรรมที่ยืนยันแล้ว</p>
          <Field
            id="fiscal-year"
            name="year"
            label="ปีงบประมาณ (พ.ศ.)"
            type="number"
            value={values.year}
            placeholder="เช่น 2569"
          />
          <div className="border-border space-y-4 border-t pt-4">
            <Field
              id="tech-stack"
              name="techStack"
              label="เทคโนโลยี (ต้องตรงทุกคำ)"
              value={values.techStack}
              placeholder="React, PostgreSQL"
            />
            <fieldset>
              <legend className="text-sm font-medium">แพลตฟอร์มเป้าหมาย (ตรงอย่างน้อยหนึ่ง)</legend>
              <div className="mt-2 grid grid-cols-2 gap-x-3">
                {PLATFORM_ORDER.map((platform: TargetPlatform) => (
                  <label key={platform} className="flex min-h-10 items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      name="targetPlatforms"
                      value={platform}
                      defaultChecked={values.targetPlatforms.includes(platform)}
                      className="accent-primary size-4 shrink-0"
                    />
                    {PLATFORM_LABELS[platform]}
                  </label>
                ))}
              </div>
            </fieldset>
            <label className="flex min-h-10 items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="outcome"
                value="tor_analysed"
                defaultChecked={values.outcome === 'tor_analysed'}
                className="accent-primary size-4"
              />
              มีสรุป TOR แล้ว
            </label>
          </div>
          <div className="bg-card sticky bottom-0 -mx-5 -mb-5 border-t px-5 py-4">
            <button type="submit" className={cn(buttonVariants(), 'h-11 w-full')}>
              ใช้ตัวกรอง
            </button>
          </div>
        </form>
      </div>
    </aside>
  );
}
