import Link from 'next/link';
import { CheckCircle2, ChevronRight } from 'lucide-react';
import type { IngestionFailure, IngestionRun } from '@torfun/types';
import { procurementsHref } from '@/components/procurements/procurement-filter-values';
import { formatShortDateTime } from '@/lib/format-date';
import { formatCount } from '@/lib/format-number';
import { cn } from '@/lib/utils';
import { formatDuration, groupFailures, type FailureGroup } from './ops-view';

function groupTitle(group: FailureGroup): string {
  if (group.live) return 'รอบที่กำลังทำงาน';
  if (!group.run) return 'ไม่อยู่ในรอบที่บันทึก';
  return `รอบ ${formatShortDateTime(group.run.startedAt)}`;
}

function groupMeta(group: FailureGroup): string | null {
  if (!group.run) return null;
  return `${formatDuration(group.run.durationMs)} · ${group.run.trigger === 'scheduled' ? 'ตามตารางเวลา' : 'สั่งเอง'}`;
}

function FailureRow({ failure, tone }: { failure: IngestionFailure; tone: 'problem' | 'quiet' }) {
  return (
    <li className="flex flex-col gap-0.5 py-2">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5">
        <Link
          href={procurementsHref({ id: failure.projectId })}
          className="line-clamp-2 min-w-0 flex-1 text-sm underline-offset-4 hover:underline"
        >
          {failure.projectName ?? failure.projectId}
        </Link>
        <span className="text-muted-foreground font-mono text-xs tabular-nums">
          {failure.projectId} · {formatShortDateTime(failure.at)}
        </span>
      </div>
      <p
        className={cn(
          'text-xs break-words',
          tone === 'problem' ? 'text-destructive' : 'text-muted-foreground',
        )}
      >
        {failure.error}
      </p>
    </li>
  );
}

function Group({ group, open }: { group: FailureGroup; open: boolean }) {
  const problems = group.total - group.noTor.length;
  const meta = groupMeta(group);

  return (
    <details open={open} className="group border-t py-3 first:border-t-0">
      <summary className="flex cursor-pointer list-none flex-wrap items-baseline justify-between gap-x-4 gap-y-1 [&::-webkit-details-marker]:hidden">
        <span className="flex flex-wrap items-baseline gap-x-3">
          <ChevronRight
            className="text-muted-foreground size-3.5 self-center group-open:rotate-90 motion-safe:transition-transform"
            aria-hidden="true"
          />
          <span className="text-sm font-medium">{groupTitle(group)}</span>
          {meta ? (
            <span className="text-muted-foreground font-mono text-xs tabular-nums">{meta}</span>
          ) : null}
        </span>
        <span className="font-mono text-xs tabular-nums">
          <span className={problems > 0 ? 'text-destructive' : 'text-muted-foreground'}>
            เป็นปัญหา {formatCount(problems)}
          </span>
          <span className="text-muted-foreground">
            {' '}
            · ไม่ใช่ปัญหา {formatCount(group.noTor.length)}
          </span>
        </span>
      </summary>

      <div className="mt-3 flex flex-col gap-4 pl-3 sm:pl-4">
        {group.problems.length > 0 ? (
          <section className="flex flex-col gap-3">
            <h3 className="text-xs font-medium">เป็นปัญหา</h3>
            {group.problems.map((stage) => (
              <div key={stage.stage} className="flex flex-col">
                <p className="text-muted-foreground text-xs">
                  {stage.label}{' '}
                  <span className="font-mono tabular-nums">
                    ({formatCount(stage.items.length)})
                  </span>
                </p>
                <ul className="flex flex-col divide-y">
                  {stage.items.map((failure, index) => (
                    <FailureRow
                      key={`${failure.projectId}-${index}`}
                      failure={failure}
                      tone="problem"
                    />
                  ))}
                </ul>
              </div>
            ))}
          </section>
        ) : null}
        {group.noTor.length > 0 ? (
          <section className="flex flex-col gap-1">
            <h3 className="text-xs font-medium">
              ไม่ใช่ปัญหา{' '}
              <span className="text-muted-foreground font-normal">หน่วยงานไม่ได้เผยแพร่ TOR</span>
            </h3>
            <ul className="flex flex-col divide-y">
              {group.noTor.map((failure, index) => (
                <FailureRow key={`${failure.projectId}-${index}`} failure={failure} tone="quiet" />
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </details>
  );
}

/**
 * The failure log, grouped by the run each failure fell in, then by stage. The
 * log has no run id, so placement is by each run's start–end window.
 * `id="failures"` is the anchor the account menu's "บันทึกข้อผิดพลาด" jumps to.
 */
export function FailureLog({
  failures,
  runs,
  liveStartedAt,
}: {
  failures: IngestionFailure[];
  runs: IngestionRun[];
  liveStartedAt: string | null;
}) {
  const groups = groupFailures(failures, runs, liveStartedAt);

  return (
    <section
      id="failures"
      aria-labelledby="failures-heading"
      className="flex scroll-mt-24 flex-col gap-3"
    >
      <div className="flex flex-col gap-1">
        <h2 id="failures-heading" className="text-base font-semibold">
          บันทึกข้อผิดพลาด
        </h2>
        <p className="text-muted-foreground text-xs">
          จัดกลุ่มตามช่วงเวลาของแต่ละรอบ แล้วตามขั้นตอน — &ldquo;ไม่ใช่ปัญหา&rdquo;
          คือโครงการที่ไม่มี TOR ให้อ่าน ไม่ต้องแก้ไข
        </p>
      </div>
      {groups.length === 0 ? (
        <div className="flex items-center gap-3 border-y py-6">
          <CheckCircle2 className="text-muted-foreground size-5" aria-hidden="true" />
          <p className="text-muted-foreground text-sm">ไม่มีข้อผิดพลาดที่บันทึกไว้</p>
        </div>
      ) : (
        <div className="border-y">
          {groups.map((group, index) => (
            <Group key={group.key} group={group} open={index === 0} />
          ))}
        </div>
      )}
    </section>
  );
}
