'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ChevronDown, SlidersHorizontal, X } from 'lucide-react';
import type { TargetPlatform } from '@torfun/types';

import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { PLATFORM_LABELS, PLATFORM_ORDER } from '@/components/company/labels';
import {
  activeFilterCount,
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
  if (values.deadlineFrom || values.deadlineTo) {
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
  if (values.location) {
    filters.push({ criterion: 'location', label: `สถานที่: ${values.location}` });
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
        placeholder={placeholder}
      />
    </div>
  );
}

export function ProcurementFilters({ values }: { values: SearchFilterValues }) {
  const active = activeFilters(values);
  const count = activeFilterCount(values);
  const [open, setOpen] = useState(count > 0);

  return (
    <div className="border-border bg-card mt-5 rounded-2xl border">
      <button
        type="button"
        aria-expanded={open}
        aria-controls="procurement-filter-fields"
        onClick={() => setOpen((current) => !current)}
        className="focus-visible:ring-ring/50 flex min-h-12 w-full cursor-pointer items-center justify-between gap-3 rounded-2xl px-4 text-start outline-none focus-visible:ring-3"
      >
        <span className="inline-flex items-center gap-2 text-sm font-medium">
          <SlidersHorizontal aria-hidden="true" className="size-4" />
          ตัวกรอง
          {count > 0 && <Badge variant="secondary">{count}</Badge>}
        </span>
        <span className="text-muted-foreground text-xs">
          {count > 0 ? 'กำลังใช้ตัวกรอง' : 'งบประมาณ วันที่ เทคโนโลยี และอื่น ๆ'}
        </span>
        <ChevronDown
          aria-hidden="true"
          className={cn('size-4 shrink-0 transition-transform duration-200', open && 'rotate-180')}
        />
      </button>

      {active.length > 0 && (
        <div aria-label="ตัวกรองที่ใช้งาน" className="flex flex-wrap gap-2 px-4 pb-4">
          {active.map((filter) => (
            <Link
              key={filter.criterion}
              href={searchHref(withoutSearchFilter(values, filter.criterion))}
              aria-label={`ล้างตัวกรอง ${filter.label}`}
              className="bg-secondary text-secondary-foreground hover:bg-secondary/70 inline-flex min-h-8 items-center gap-1.5 rounded-full px-3 text-xs font-medium transition-colors"
            >
              {filter.label}
              <X aria-hidden="true" className="size-3.5" />
            </Link>
          ))}
          <Link
            href={values.query ? `/search?q=${encodeURIComponent(values.query)}` : '/search'}
            className="text-muted-foreground hover:text-foreground inline-flex min-h-8 items-center px-2 text-xs font-medium transition-colors"
          >
            ล้างทั้งหมด
          </Link>
        </div>
      )}

      <div
        className={cn(
          'grid transition-[grid-template-rows,opacity] duration-200 ease-out motion-reduce:transition-none',
          open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0',
        )}
      >
        <div
          id="procurement-filter-fields"
          aria-hidden={!open}
          inert={!open ? true : undefined}
          className="min-h-0 overflow-hidden"
        >
          <form action="/search" method="get" className="border-border border-t p-4 sm:p-5">
            {values.query && <input type="hidden" name="q" value={values.query} />}

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Field
                id="min-budget"
                name="minBudget"
                label="งบประมาณต่ำสุด (บาท)"
                type="number"
                value={values.minBudget}
                placeholder="เช่น 500000"
              />
              <Field
                id="max-budget"
                name="maxBudget"
                label="งบประมาณสูงสุด (บาท)"
                type="number"
                value={values.maxBudget}
                placeholder="เช่น 5000000"
              />
              <Field
                id="published-from"
                name="publishedFrom"
                label="ประกาศตั้งแต่"
                type="date"
                value={values.publishedFrom}
              />
              <Field
                id="published-to"
                name="publishedTo"
                label="ประกาศถึง"
                type="date"
                value={values.publishedTo}
              />
              <Field
                id="deadline-from"
                name="deadlineFrom"
                label="กำหนดส่งตั้งแต่"
                type="date"
                value={values.deadlineFrom}
              />
              <Field
                id="deadline-to"
                name="deadlineTo"
                label="กำหนดส่งถึง"
                type="date"
                value={values.deadlineTo}
              />
              <Field
                id="tech-stack"
                name="techStack"
                label="เทคโนโลยี (ต้องตรงทุกคำ)"
                value={values.techStack}
                placeholder="React, PostgreSQL"
              />
            </div>

            <fieldset className="mt-4">
              <legend className="text-sm font-medium">แพลตฟอร์มเป้าหมาย (ตรงอย่างน้อยหนึ่ง)</legend>
              <div className="mt-2 flex flex-wrap gap-x-5 gap-y-2">
                {PLATFORM_ORDER.map((platform: TargetPlatform) => (
                  <label key={platform} className="inline-flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      name="targetPlatforms"
                      value={platform}
                      defaultChecked={values.targetPlatforms.includes(platform)}
                      className="border-input accent-primary size-4 rounded border"
                    />
                    {PLATFORM_LABELS[platform]}
                  </label>
                ))}
              </div>
            </fieldset>

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Field
                id="industry"
                name="industry"
                label="คำค้นในชื่อโครงการ / ชื่อหน่วยงาน"
                value={values.industry}
                placeholder="เช่น โรงพยาบาล, โรงเรียน"
              />
              <Field
                id="location"
                name="location"
                label="สถานที่ดำเนินงาน"
                value={values.location}
                placeholder="เช่น กรุงเทพมหานคร, คลองเตย"
              />
            </div>

            <p className="text-muted-foreground mt-2 text-xs leading-relaxed">
              คำค้นชื่อโครงการ/หน่วยงานไม่ใช่หมวดอุตสาหกรรมที่ยืนยันแล้ว ส่วนสถานที่ค้นจากจังหวัด
              อำเภอ/เขต และตำบล/แขวงที่ประกาศระบุ
            </p>
            <p className="text-muted-foreground mt-2 text-xs leading-relaxed">
              กำหนดส่ง เทคโนโลยี และแพลตฟอร์มค้นจาก TOR ที่วิเคราะห์สำเร็จแล้วเท่านั้น
              ประกาศที่ยังไม่มีผลวิเคราะห์จะไม่ตรงกับตัวกรองเหล่านี้
            </p>

            <div className="mt-5 flex flex-wrap items-center gap-2">
              <button type="submit" className={buttonVariants()}>
                ใช้ตัวกรอง
              </button>
              {count > 0 && (
                <Link
                  href={values.query ? `/search?q=${encodeURIComponent(values.query)}` : '/search'}
                  className={cn(buttonVariants({ variant: 'ghost' }), 'gap-1.5')}
                >
                  <X aria-hidden="true" className="size-4" />
                  ล้างตัวกรอง
                </Link>
              )}
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
