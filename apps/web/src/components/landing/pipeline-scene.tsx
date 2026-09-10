'use client';

import { memo, useEffect, useRef } from 'react';
import gsap from 'gsap';
import { FileText } from 'lucide-react';

import { cn } from '@/lib/utils';

/**
 * Rows standing in for a page of announcements.
 *
 * Deliberately unlabelled: no project names, no agency names, no counts. This
 * is an illustration of what the pipeline does, and inventing plausible-looking
 * records for a marketing panel is exactly what an officer must never have to
 * wonder about when they later read the real queue. `bar` is the width of the
 * placeholder line, `keep` whether this one survives the filter, and `label`
 * the bucket `softwareClass` would put it in — the product's own vocabulary,
 * applied to nothing in particular.
 */
const ROWS = [
  { bar: '78%', keep: true, label: 'พัฒนาระบบใหม่' },
  { bar: '54%', keep: false, label: 'ไม่ใช่งานซอฟต์แวร์' },
  { bar: '86%', keep: true, label: 'ดูแลและบำรุงรักษา' },
  { bar: '62%', keep: false, label: 'ไม่ใช่งานซอฟต์แวร์' },
  { bar: '71%', keep: true, label: 'พัฒนาระบบใหม่' },
] as const;

/**
 * The hero's moving part: the discarding, shown rather than described.
 *
 * A scan passes down a page of announcements, the ones that are not software
 * work fade back, and what is left is tagged and lifted. That is the whole
 * product in six seconds, and it loops.
 *
 * Memoised and sealed in its own client component. The loop runs forever, so it
 * must never be able to re-render the page around it. With motion reduced the
 * timeline is never built and the markup below is already the settled end
 * state, which is the honest still frame of the same idea.
 */
export const PipelineScene = memo(function PipelineScene() {
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const scope = root.current;
    if (!scope) return;

    const mm = gsap.matchMedia(scope);

    mm.add('(prefers-reduced-motion: no-preference)', () => {
      const rows = gsap.utils.toArray<HTMLElement>('[data-row]', scope);
      const dropped = rows.filter((row) => row.dataset.keep !== 'true');
      const kept = rows.filter((row) => row.dataset.keep === 'true');
      const tags = gsap.utils.toArray<HTMLElement>('[data-tag]', scope);
      const scan = scope.querySelector<HTMLElement>('[data-scan]');

      const timeline = gsap.timeline({ repeat: -1, defaults: { ease: 'power2.out' } });

      timeline
        .set(rows, { opacity: 1, y: 0, filter: 'none' })
        .set(tags, { opacity: 0, scale: 0.8 })
        .from(rows, { opacity: 0, y: 14, stagger: 0.08, duration: 0.5 });

      if (scan) {
        timeline.fromTo(
          scan,
          { yPercent: -100, opacity: 0 },
          { yPercent: 400, opacity: 1, duration: 1.1, ease: 'none' },
          '>-0.1',
        );
        timeline.to(scan, { opacity: 0, duration: 0.2 }, '<0.9');
      }

      timeline
        .to(dropped, { opacity: 0.22, filter: 'saturate(0)', duration: 0.45, stagger: 0.06 }, '<')
        .to(tags, { opacity: 1, scale: 1, duration: 0.4, stagger: 0.09, ease: 'back.out(2)' })
        .to(kept, { y: -3, duration: 0.35, stagger: 0.06 }, '<')
        .to(kept, { y: 0, duration: 0.35, stagger: 0.06 })
        .to({}, { duration: 1.6 })
        .to(rows, { opacity: 0, y: -10, duration: 0.4, stagger: 0.05 });

      return () => {
        timeline.kill();
      };
    });

    return () => {
      mm.revert();
    };
  }, []);

  return (
    <div ref={root} className="bg-card shadow-lifted rounded-[1.75rem] border p-5 sm:p-7">
      <div className="flex items-center justify-between border-b pb-4">
        <p className="text-sm font-semibold">คัดกรองประกาศอัตโนมัติ</p>
        <FileText aria-hidden="true" className="text-primary size-5" />
      </div>

      <div className="relative overflow-hidden py-5">
        {/* The scan. Purely decorative, and the only element here that is not
            part of the still frame a reader with motion off sees. */}
        <div
          data-scan
          aria-hidden="true"
          className="via-primary/60 pointer-events-none absolute inset-x-0 top-0 z-10 h-16 bg-gradient-to-b from-transparent to-transparent opacity-0"
        />

        <ul className="space-y-2.5">
          {ROWS.map(({ bar, keep, label }, index) => (
            <li
              key={index}
              data-row
              data-keep={keep}
              className={cn(
                'flex items-center gap-3 rounded-xl border px-3 py-2.5',
                keep ? 'border-primary/25 bg-primary/[0.04]' : 'border-border bg-muted/40',
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  'size-2 shrink-0 rounded-full',
                  keep ? 'bg-primary' : 'bg-muted-foreground/40',
                )}
              />
              <span className="min-w-0 flex-1 space-y-1.5">
                <span className="bg-foreground/15 block h-2 rounded-full" style={{ width: bar }} />
                <span className="bg-foreground/10 block h-2 w-1/3 rounded-full" />
              </span>
              {keep && (
                <span
                  data-tag
                  className="bg-primary/10 text-primary shrink-0 rounded-full px-2 py-1 text-[0.6875rem] font-medium whitespace-nowrap"
                >
                  {label}
                </span>
              )}
            </li>
          ))}
        </ul>
      </div>

      <p className="text-muted-foreground border-t pt-4 text-xs">
        ภาพประกอบการทำงาน · AI ช่วยอ่าน โดยมีทีมของคุณเป็นผู้ตัดสินใจ
      </p>
    </div>
  );
});
