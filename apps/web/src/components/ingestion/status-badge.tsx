import type { IngestionOutcome, IngestionState } from "@torfun/types";
import { Badge } from "@/components/ui/badge";

/**
 * The four processing states from the functional requirements, plus the finer
 * outcome underneath.
 *
 * Colour is never the only signal — each badge carries its own label — so the
 * table stays readable for colour-blind users and in monochrome print.
 */

const STATE_STYLES: Record<IngestionState, string> = {
  Queued: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  Processing: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300",
  Completed: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  Failed: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
};

const OUTCOME_LABELS: Record<IngestionOutcome, string> = {
  queued: "รอดำเนินการ",
  processing: "กำลังดึงข้อมูล",
  tor_downloaded: "ได้ไฟล์ TOR",
  no_tor_in_archive: "ไม่มี TOR ในไฟล์บีบอัด",
  no_tor_package: "ไม่มีชุดเอกสาร TOR",
  error: "ดึงข้อมูลผิดพลาด",
};

export function StateBadge({ state }: { state: IngestionState }) {
  return <Badge className={STATE_STYLES[state]}>{state}</Badge>;
}

export function OutcomeLabel({ outcome }: { outcome: IngestionOutcome }) {
  return <span className="text-xs text-muted-foreground">{OUTCOME_LABELS[outcome]}</span>;
}
