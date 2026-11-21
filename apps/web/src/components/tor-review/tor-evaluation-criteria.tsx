import type { Evaluation, EvaluationSubCriterion, EvaluationWeightUnit } from '@torfun/types';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  EVALUATION_DOCUMENT_LABELS,
  EVALUATION_METHOD_HINTS,
  EVALUATION_METHOD_LABELS,
} from '@/components/company/labels';

/**
 * How the winner is chosen and what each criterion weighs (#143). An AI reading,
 * never an authority: it says which document it came from, quotes the passage
 * and points to where it is, so an officer can check it before bidding.
 *
 * `evaluation === undefined` means it was never read (older analyses, a document
 * that could not be sent); a reading with no method means the document was read
 * and did not say. Those are different things and are worded differently.
 *
 * Weights are shown exactly as written, in the unit written. Totals are worked
 * out for display only, and a total that is not what the document should add up
 * to is flagged, never corrected.
 */

function formatWeight(weight: number | null, unit: EvaluationWeightUnit | null): string {
  if (weight === null) return 'ไม่ระบุน้ำหนัก';
  if (unit === 'percent') return `${weight}%`;
  if (unit === 'points') return `${weight} คะแนน`;
  return `${weight} (ไม่ระบุหน่วย)`;
}

/** The sum of a set of weights, only where every one is known and they share a unit. */
function total(
  items: readonly EvaluationSubCriterion[],
): { value: number; unit: EvaluationWeightUnit } | null {
  if (items.length === 0) return null;
  const unit = items[0]!.unit;
  if (unit === null) return null;
  let sum = 0;
  for (const item of items) {
    if (item.weight === null || item.unit !== unit) return null;
    sum += item.weight;
  }
  return { value: Math.round(sum * 100) / 100, unit };
}

const differs = (a: number, b: number) => Math.abs(a - b) > 0.01;

export function TorEvaluationCriteria({ evaluation }: { evaluation?: Evaluation }) {
  if (evaluation === undefined) {
    return (
      <Card className="mt-5">
        <CardHeader>
          <CardTitle className="text-base">ยังไม่มีข้อมูลวิธีพิจารณาผู้ชนะ</CardTitle>
          <p className="text-muted-foreground text-sm">
            ยังไม่มีผลการสกัดวิธีพิจารณาและเกณฑ์น้ำหนักจากเอกสารของโครงการนี้
          </p>
        </CardHeader>
      </Card>
    );
  }

  const document = EVALUATION_DOCUMENT_LABELS[evaluation.document];
  // "จากTOR" reads badly: a Latin label is set off with a space, a Thai one is not.
  const from = /^[A-Za-z]/.test(document) ? ` ${document}` : document;
  const sum = total(evaluation.criteria);
  const percentOff = sum?.unit === 'percent' && differs(sum.value, 100);

  return (
    <Card className="mt-5">
      <CardHeader>
        <CardTitle className="text-base">
          {evaluation.method
            ? EVALUATION_METHOD_LABELS[evaluation.method]
            : 'เอกสารไม่ระบุวิธีพิจารณาผู้ชนะ'}
        </CardTitle>
        <p className="text-muted-foreground text-sm">
          AI อ่านวิธีพิจารณาผู้ชนะจาก{from} โปรดตรวจเงื่อนไขในเอกสารต้นฉบับก่อนตัดสินใจยื่นข้อเสนอ
        </p>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="flex flex-wrap items-center gap-2">
          {evaluation.method && (
            <Badge variant="outline">{EVALUATION_METHOD_HINTS[evaluation.method]}</Badge>
          )}
          <span className="text-muted-foreground text-xs">
            {evaluation.source
              ? `อ้างอิง ${document} · ${evaluation.source}`
              : `อ่านจาก${from} (ไม่ระบุตำแหน่ง)`}
          </span>
        </div>

        {evaluation.quote && (
          <p className="text-muted-foreground text-sm leading-relaxed">
            ข้อความในเอกสาร: “{evaluation.quote}”
          </p>
        )}

        {evaluation.criteria.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            {evaluation.method
              ? 'เอกสารระบุวิธีพิจารณา แต่ AI ไม่พบเกณฑ์พร้อมน้ำหนัก'
              : 'AI ไม่พบวิธีพิจารณาผู้ชนะในเอกสารนี้'}
          </p>
        ) : (
          <ul className="divide-border divide-y">
            {evaluation.criteria.map((criterion, index) => {
              const parts = criterion.children ?? [];
              const partsSum = total(parts);
              const partsOff =
                partsSum !== null &&
                criterion.weight !== null &&
                criterion.unit === partsSum.unit &&
                differs(partsSum.value, criterion.weight);
              return (
                <li
                  key={`${criterion.name}-${index}`}
                  className="grid gap-2 py-3 first:pt-0 last:pb-0"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="text-sm font-medium">{criterion.name}</span>
                    <span className="text-sm" data-numeric>
                      {formatWeight(criterion.weight, criterion.unit)}
                    </span>
                  </div>
                  {parts.length > 0 && (
                    <ul className="text-muted-foreground space-y-1 ps-5 text-sm">
                      {parts.map((part, partIndex) => (
                        <li
                          key={`${part.name}-${partIndex}`}
                          className="flex flex-wrap items-baseline justify-between gap-2"
                        >
                          <span>{part.name}</span>
                          <span data-numeric>{formatWeight(part.weight, part.unit)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {partsOff && partsSum && (
                    <p className="text-destructive text-xs">
                      เกณฑ์ย่อยรวมกัน {formatWeight(partsSum.value, partsSum.unit)}{' '}
                      ไม่เท่ากับน้ำหนักของเกณฑ์นี้ โปรดตรวจกับเอกสารต้นฉบับ
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {sum && (
          <p className={percentOff ? 'text-destructive text-sm' : 'text-muted-foreground text-sm'}>
            น้ำหนักรวม {formatWeight(sum.value, sum.unit)}
            {percentOff && ' ไม่เท่ากับ 100% โปรดตรวจกับเอกสารต้นฉบับ'}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
