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
import { activeFilterCount, type SearchFilterValues } from './search-filter-values';

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
              <Field
                id="purchase-method"
                name="purchaseMethod"
                label="วิธีจัดซื้อจัดจ้าง"
                value={values.purchaseMethod}
                placeholder="เช่น e-bidding"
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
                label="คำเกี่ยวกับอุตสาหกรรม / หน่วยงาน"
                value={values.industry}
                placeholder="เช่น โรงพยาบาล, โรงเรียน"
              />
              <p className="text-muted-foreground self-end pb-2 text-xs leading-relaxed">
                ค้นจากชื่อประกาศและชื่อหน่วยงานที่มีอยู่ ไม่ใช่หมวดอุตสาหกรรมที่หน่วยงานยืนยัน
              </p>
            </div>

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
