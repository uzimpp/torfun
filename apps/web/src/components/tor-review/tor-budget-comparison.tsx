'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { BudgetComparison, BudgetComparisonBasis, BudgetComparisonGroup } from '@torfun/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useTorBudgetComparison } from './use-tor-budget-comparison';

/**
 * A TOR's planned budget against those of similar earlier procurements TORfun
 * has stored (#61). The figure compared is `projectMoney`, the agency's PLANNED
 * procurement budget: not a winning price and not a contract price, and nothing
 * here may be worded as either. Those belong to the award section, which comes
 * from a different source.
 *
 * Three groups, chosen by the officer, each saying what it matched on and how
 * many projects it found. `count` is every eligible project, so when more than
 * ten exist the list says it shows only some. Below the minimum sample there are
 * no summary numbers, only the count and the projects.
 */

const baht = new Intl.NumberFormat('th-TH', { maximumFractionDigits: 2 });
const money = (value: number) => `${baht.format(value)} บาท`;
const signed = (value: number) =>
  value === 0 ? 'เท่ากัน' : `${value > 0 ? '+' : '−'}${baht.format(Math.abs(value))} บาท`;

const BASIS: Record<BudgetComparisonBasis, { tab: string; matched: string }> = {
  category: { tab: 'หมวดเดียวกัน', matched: 'รหัสหมวด/ประเภทของ e-GP' },
  agency: { tab: 'หน่วยงานเดียวกัน', matched: 'หน่วยงาน' },
  tech: { tab: 'เทคโนโลยีร่วมกัน', matched: 'เทคโนโลยี (ตรงกันอย่างน้อย 1 รายการ)' },
};

const POSITION = {
  below_range: 'ต่ำกว่าทุกโครงการที่เทียบ',
  within_range: 'อยู่ในช่วงของโครงการที่เทียบ',
  above_range: 'สูงกว่าทุกโครงการที่เทียบ',
} as const;

/** The group opened first: one with a summary, else one with projects, else the first. */
function firstGroup(groups: readonly BudgetComparisonGroup[]): BudgetComparisonBasis {
  return (groups.find((group) => group.summary !== null) ??
    groups.find((group) => group.count > 0) ??
    groups[0])!.basis;
}

function Group({ group }: { group: BudgetComparisonGroup }) {
  const { summary } = group;
  const names = BASIS[group.basis];

  if (group.criterion === null) {
    return (
      <p className="text-muted-foreground text-sm">
        เทียบด้วยเกณฑ์นี้ไม่ได้ เพราะ TOR นี้ไม่มีข้อมูลที่ใช้จับคู่ (เช่น รหัสหมวด หน่วยงาน
        เทคโนโลยี หรือวันที่ประกาศ)
      </p>
    );
  }

  return (
    <div className="grid gap-4">
      <p className="text-muted-foreground text-sm">
        จับคู่ด้วย {names.matched}: <span className="text-foreground">{group.criterion}</span>
      </p>
      <p className="text-sm">
        ในโครงการที่ TORfun เก็บไว้ พบ <span data-numeric>{group.count}</span> โครงการ
        {group.count > group.projects.length && (
          <span className="text-muted-foreground">
            {' '}
            (แสดง <span data-numeric>{group.projects.length}</span> จากทั้งหมด{' '}
            <span data-numeric>{group.count}</span> โครงการ)
          </span>
        )}
      </p>

      {summary ? (
        <div className="grid gap-2">
          <dl className="grid gap-1 text-sm">
            {(
              [
                ['งบประมาณที่ตั้งไว้ต่ำสุด', summary.min],
                ['มัธยฐาน', summary.median],
                ['งบประมาณที่ตั้งไว้สูงสุด', summary.max],
              ] as const
            ).map(([label, value]) => (
              <div key={label} className="flex flex-wrap items-baseline justify-between gap-2">
                <dt className="text-muted-foreground">{label}</dt>
                <dd data-numeric>{money(value)}</dd>
              </div>
            ))}
          </dl>
          <p className="text-sm font-medium">งบของ TOR นี้{POSITION[summary.position]}</p>
          <p className="text-muted-foreground text-xs" data-numeric>
            สูงกว่า {summary.below} จาก {group.count} โครงการ · ต่ำกว่า {summary.above} จาก{' '}
            {group.count} โครงการ
            {summary.equal > 0 && ` · เท่ากับ ${summary.equal} โครงการ`} · อันดับ {summary.rank} จาก{' '}
            {summary.rankOf} (1 = งบต่ำสุด)
          </p>
        </div>
      ) : null}

      {group.projects.length > 0 && (
        <div className="sm:overflow-x-auto">
          {/*
            A table from `sm` up. Below it each project is a block: the name, then each
            figure on its own line with its label, so nothing needs a sideways scroll.
          */}
          <table className="block w-full text-sm sm:table">
            <thead className="hidden sm:table-header-group">
              <tr className="text-muted-foreground border-b text-start text-xs">
                <th className="py-1.5 pe-3 text-start font-medium">โครงการ</th>
                <th className="py-1.5 pe-3 text-end font-medium">งบประมาณที่ตั้งไว้</th>
                <th className="py-1.5 pe-3 text-end font-medium">ต่างจาก TOR นี้</th>
                <th className="py-1.5 text-end font-medium">ปีงบประมาณ</th>
              </tr>
            </thead>
            <tbody className="divide-border block divide-y sm:table-row-group">
              {group.projects.map((project) => (
                <tr key={project.projectId} className="block py-2.5 sm:table-row sm:py-0">
                  <td className="block pb-1 sm:table-cell sm:py-1.5 sm:pe-3">
                    <Link
                      href={`/tor/${encodeURIComponent(project.projectId)}`}
                      className="text-primary block max-w-none break-words hover:underline sm:max-w-xl lg:max-w-2xl"
                    >
                      {project.projectName}
                    </Link>
                    <span
                      className="text-muted-foreground block max-w-none truncate text-xs sm:max-w-xl lg:max-w-2xl"
                      title={project.deptName}
                    >
                      {project.deptName}
                    </span>
                  </td>
                  <td
                    data-label="งบประมาณที่ตั้งไว้"
                    className="before:text-muted-foreground flex justify-between gap-3 py-0.5 whitespace-nowrap before:text-xs before:content-[attr(data-label)] sm:table-cell sm:py-1.5 sm:pe-3 sm:text-end sm:before:hidden"
                    data-numeric
                  >
                    {money(project.budget)}
                  </td>
                  <td
                    data-label="ต่างจาก TOR นี้"
                    className="before:text-muted-foreground flex justify-between gap-3 py-0.5 whitespace-nowrap before:text-xs before:content-[attr(data-label)] sm:table-cell sm:py-1.5 sm:pe-3 sm:text-end sm:before:hidden"
                    data-numeric
                  >
                    {signed(project.difference)}
                  </td>
                  <td
                    data-label="ปีงบประมาณ"
                    className="before:text-muted-foreground flex justify-between gap-3 py-0.5 before:text-xs before:content-[attr(data-label)] sm:table-cell sm:py-1.5 sm:text-end sm:before:hidden"
                    data-numeric
                  >
                    {project.budgetYear ?? 'ไม่ทราบ'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Comparison({ comparison }: { comparison: BudgetComparison }) {
  const [chosen, setChosen] = useState<BudgetComparisonBasis | null>(null);
  const basis = chosen ?? firstGroup(comparison.groups);
  const group = comparison.groups.find((candidate) => candidate.basis === basis)!;

  return (
    <Card className="mt-5">
      <CardHeader>
        <CardTitle className="text-base">
          งบประมาณที่ตั้งไว้ เทียบกับโครงการคล้ายกันที่ประกาศก่อนหน้า
        </CardTitle>
        <p className="text-sm">
          งบประมาณที่ตั้งไว้ของ TOR นี้:{' '}
          <span data-numeric className="font-medium">
            {money(comparison.budget!)}
          </span>
        </p>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div
          role="tablist"
          aria-label="เกณฑ์ที่ใช้เลือกโครงการคล้ายกัน"
          className="flex flex-wrap gap-2"
        >
          {comparison.groups.map((candidate) => (
            <Button
              key={candidate.basis}
              type="button"
              role="tab"
              size="sm"
              aria-selected={candidate.basis === basis}
              variant={candidate.basis === basis ? 'default' : 'outline'}
              onClick={() => setChosen(candidate.basis)}
            >
              {BASIS[candidate.basis].tab} ({candidate.count})
            </Button>
          ))}
        </div>
        <div role="tabpanel">
          <Group group={group} />
        </div>
      </CardContent>
    </Card>
  );
}

export function TorBudgetComparison({ projectId }: { projectId: string }) {
  const state = useTorBudgetComparison(projectId);

  if (state.status === 'loading') {
    return (
      <p role="status" className="text-muted-foreground mt-5 text-sm">
        กำลังโหลดการเทียบงบประมาณ
      </p>
    );
  }
  if (state.status === 'error') {
    return (
      <Card className="mt-5">
        <CardHeader>
          <CardTitle className="text-base">โหลดการเทียบงบประมาณไม่สำเร็จ</CardTitle>
          <p className="text-muted-foreground text-sm">
            ส่วนอื่นของหน้านี้ไม่ได้รับผลกระทบ ลองโหลดหน้าใหม่อีกครั้ง
          </p>
        </CardHeader>
      </Card>
    );
  }
  if (state.comparison.budget === null) {
    return (
      <Card className="mt-5">
        <CardHeader>
          <CardTitle className="text-base">เทียบงบประมาณไม่ได้</CardTitle>
          <p className="text-muted-foreground text-sm">
            TOR นี้ยังไม่มีข้อมูลงบประมาณที่หน่วยงานตั้งไว้ จึงไม่มีตัวเลขให้เทียบ
          </p>
        </CardHeader>
      </Card>
    );
  }
  return <Comparison comparison={state.comparison} />;
}
