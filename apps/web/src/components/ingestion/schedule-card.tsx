'use client';

import Link from 'next/link';
import { useId, useRef, useState, type FormEvent } from 'react';
import type { ScheduleView } from '@torfun/types';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import {
  formatBangkok,
  hourChoicesFor,
  toFormValues,
  validateSchedule,
  type ScheduleFormErrors,
  type ScheduleFormValues,
} from './schedule-form';
import { useScheduleData, type ScheduleData } from './use-schedule-data';

/** Placeholder that holds the form's footprint, so the page does not jump when it arrives. */
function ScheduleSkeleton() {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="กำลังโหลดตารางเวลา"
      className="grid gap-6 md:grid-cols-[3fr_2fr]"
    >
      <div className="flex flex-col gap-4">
        <div className="bg-muted h-11 w-2/3 animate-pulse rounded-md motion-reduce:animate-none" />
        <div className="bg-muted h-11 w-full animate-pulse rounded-md motion-reduce:animate-none" />
        <div className="bg-muted h-11 w-1/2 animate-pulse rounded-md motion-reduce:animate-none" />
      </div>
      <div className="bg-muted h-28 animate-pulse rounded-md motion-reduce:animate-none" />
    </div>
  );
}

/** A switch that says what it is in words — colour is never the only signal. */
function Switch({
  checked,
  onChange,
  labelId,
  describedBy,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  labelId: string;
  describedBy: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-labelledby={labelId}
      aria-describedby={describedBy}
      onClick={() => onChange(!checked)}
      className={cn(
        'focus-visible:ring-ring/50 relative inline-flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-full border transition-colors outline-none focus-visible:ring-[3px] motion-reduce:transition-none',
        checked ? 'border-primary bg-primary' : 'border-input bg-muted',
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'bg-background size-5 rounded-full shadow-sm transition-transform motion-reduce:transition-none',
          checked ? 'translate-x-6' : 'translate-x-1',
        )}
      />
    </button>
  );
}

function SessionEnded() {
  return (
    <Link href="/login" className={cn(buttonVariants({ variant: 'outline' }), 'min-h-11')}>
      เข้าสู่ระบบอีกครั้ง
    </Link>
  );
}

/**
 * The form proper. Holds the draft the person is editing; what is saved, and
 * whether saving worked, come from the hook and are shown as the server said.
 * Remounted (via `key`) when a save succeeds, so the draft restarts from the
 * stored schedule instead of drifting from it.
 */
function ScheduleForm({
  schedule,
  data,
}: {
  schedule: ScheduleView;
  data: Pick<ScheduleData, 'saving' | 'saveError' | 'saved' | 'sessionEnded' | 'save'>;
}) {
  const [values, setValues] = useState<ScheduleFormValues>(() => toFormValues(schedule));
  const [errors, setErrors] = useState<ScheduleFormErrors>({});
  const timeRef = useRef<HTMLInputElement>(null);
  const hoursRef = useRef<HTMLSelectElement>(null);

  const id = useId();
  const switchLabelId = `${id}-switch-label`;
  const switchStateId = `${id}-switch-state`;
  const timeErrorId = `${id}-time-error`;
  const hoursErrorId = `${id}-hours-error`;

  const change = (patch: Partial<ScheduleFormValues>) => {
    setValues((current) => ({ ...current, ...patch }));
    // A message about a field the person is now editing is stale the moment they touch it.
    setErrors({});
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const found = validateSchedule(values);
    setErrors(found);
    if (found.timeOfDay) timeRef.current?.focus();
    else if (found.everyHours) hoursRef.current?.focus();
    else void data.save(values);
  };

  const { saving, saveError, saved, sessionEnded } = data;
  const control =
    'border-input focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:border-destructive h-11 w-full rounded-md border bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:ring-[3px]';

  return (
    <form onSubmit={submit} noValidate className="grid gap-8 md:grid-cols-[3fr_2fr] md:gap-0">
      <div className="flex flex-col gap-6 md:pr-8">
        <div className="flex items-center gap-4">
          <Switch
            checked={values.enabled}
            onChange={(enabled) => change({ enabled })}
            labelId={switchLabelId}
            describedBy={switchStateId}
          />
          <div className="flex flex-col">
            <span id={switchLabelId} className="text-sm font-medium">
              เปิดใช้งานรอบอัตโนมัติ
            </span>
            <span id={switchStateId} className="text-muted-foreground text-sm">
              {values.enabled ? 'เปิดอยู่' : 'ปิดอยู่'}
            </span>
          </div>
        </div>

        <fieldset className="flex flex-col gap-2">
          <legend className="text-muted-foreground mb-2 text-xs font-medium">ความถี่</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {(
              [
                { mode: 'daily', label: 'ทุกวัน' },
                { mode: 'interval', label: 'ทุก N ชั่วโมง' },
              ] as const
            ).map((option) => (
              <label
                key={option.mode}
                className="border-input has-[:checked]:border-primary has-[:focus-visible]:ring-ring/50 flex min-h-11 cursor-pointer items-center gap-3 rounded-md border px-3 text-sm has-[:focus-visible]:ring-[3px]"
              >
                <input
                  type="radio"
                  name={`${id}-mode`}
                  value={option.mode}
                  checked={values.mode === option.mode}
                  onChange={() => change({ mode: option.mode })}
                  className="accent-primary size-4"
                />
                {option.label}
              </label>
            ))}
          </div>
        </fieldset>

        {values.mode === 'daily' ? (
          <div className="flex flex-col gap-2">
            <Label htmlFor={`${id}-time`} className="text-muted-foreground text-xs">
              เวลาเริ่มรอบ (เวลาไทย)
            </Label>
            <Input
              ref={timeRef}
              id={`${id}-time`}
              type="time"
              value={values.timeOfDay}
              onChange={(event) => change({ timeOfDay: event.target.value })}
              aria-invalid={errors.timeOfDay ? true : undefined}
              aria-describedby={errors.timeOfDay ? timeErrorId : undefined}
              className="h-11 sm:max-w-40"
            />
            {errors.timeOfDay ? (
              <p id={timeErrorId} className="text-destructive text-sm">
                {errors.timeOfDay}
              </p>
            ) : null}
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <Label htmlFor={`${id}-hours`} className="text-muted-foreground text-xs">
              เว้นระยะ (ชั่วโมง)
            </Label>
            <select
              ref={hoursRef}
              id={`${id}-hours`}
              value={values.everyHours}
              onChange={(event) => change({ everyHours: Number(event.target.value) })}
              aria-invalid={errors.everyHours ? true : undefined}
              aria-describedby={errors.everyHours ? hoursErrorId : undefined}
              className={cn(control, 'sm:max-w-40')}
            >
              {hourChoicesFor(values.everyHours).map((hours) => (
                <option key={hours} value={hours}>
                  {hours}
                </option>
              ))}
            </select>
            {errors.everyHours ? (
              <p id={hoursErrorId} className="text-destructive text-sm">
                {errors.everyHours}
              </p>
            ) : null}
          </div>
        )}

        <p className="text-muted-foreground max-w-[65ch] text-sm leading-relaxed">
          รอบอัตโนมัติใช้เวลาประเทศไทย (UTC+7) และตั้งได้ไม่ถี่กว่าทุก 6 ชั่วโมง
          เพื่อไม่ให้ขอข้อมูลจากระบบต้นทางมากเกินไป เมื่อเปิดใช้งานแล้วจะไม่เริ่มรอบทันที
          รอบแรกคือเวลาถัดไปที่ตั้งไว้
        </p>

        <div className="flex flex-wrap items-center gap-4">
          <Button type="submit" disabled={saving} className="min-h-11 px-5">
            {saving ? 'กำลังบันทึก…' : 'บันทึกตารางเวลา'}
          </Button>
          <p role="status" aria-label="ผลการบันทึก" className="text-sm">
            {saved ? 'บันทึกตารางเวลาแล้ว' : null}
          </p>
        </div>

        {saveError ? (
          <div
            role="alert"
            className="border-destructive/50 flex flex-col gap-3 rounded-md border p-4"
          >
            <p className="text-destructive text-sm">{saveError}</p>
            {sessionEnded ? <SessionEnded /> : null}
          </div>
        ) : null}
      </div>

      <dl className="border-border flex flex-col gap-5 border-t pt-6 md:border-t-0 md:border-l md:pt-0 md:pl-8">
        <div className="flex flex-col gap-1">
          <dt className="text-muted-foreground text-xs font-medium">รอบถัดไป</dt>
          <dd className="text-lg font-semibold tabular-nums">
            {schedule.enabled && schedule.nextRunAt
              ? formatBangkok(schedule.nextRunAt)
              : 'ยังไม่ได้กำหนด'}
          </dd>
        </div>
        <div className="flex flex-col gap-1">
          <dt className="text-muted-foreground text-xs font-medium">รอบล่าสุด</dt>
          <dd className="text-base tabular-nums">
            {schedule.lastRunAt ? formatBangkok(schedule.lastRunAt) : 'ยังไม่เคยเริ่มรอบ'}
          </dd>
        </div>
      </dl>
    </form>
  );
}

/**
 * When Runs start on their own — a Site Administrator's control, beside the
 * button that starts one by hand. Off until someone turns it on.
 */
export function ScheduleCard() {
  const data = useScheduleData();
  const { schedule, loading, error, sessionEnded, retry } = data;

  return (
    <section aria-labelledby="schedule-heading">
      <Card>
        <CardHeader>
          <CardTitle>
            <h2 id="schedule-heading" className="text-base font-semibold">
              ตารางเวลาดึงข้อมูลอัตโนมัติ
            </h2>
          </CardTitle>
          <CardDescription>
            ตั้งให้เริ่มรอบดึงข้อมูลเองตามเวลา โดยไม่ต้องกดปุ่มเริ่มรอบ
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <ScheduleSkeleton />
          ) : error || !schedule ? (
            <div
              role="alert"
              className="border-destructive/50 flex flex-col gap-3 rounded-md border p-4"
            >
              <p className="text-destructive text-sm">{sessionEnded ? 'เซสชันหมดอายุ' : error}</p>
              {sessionEnded ? (
                <SessionEnded />
              ) : (
                <div>
                  <Button variant="outline" onClick={retry} className="min-h-11">
                    ลองอีกครั้ง
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <ScheduleForm key={schedule.updatedAt ?? 'unsaved'} schedule={schedule} data={data} />
          )}
        </CardContent>
      </Card>
    </section>
  );
}
