/** Calendar days for Thai tenders, shared by API deadline windows and the UI. */
export const DAY_MS = 86_400_000;

export function thailandDay(now: Date = new Date()): string {
  return new Date(now.valueOf() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export function addCalendarDays(day: string, days: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

/** Date-only values are calendar days; timestamps are displayed in Thailand time. */
export function procurementDay(value: string | null | undefined): string | null {
  if (!value) return null;
  // Reject free text instead of allowing Date's permissive locale-dependent parsing.
  if (!/^\d{4}-\d{2}-\d{2}(?:$|T)/.test(value)) return null;
  const calendar = value.slice(0, 10);
  const dateOnly = new Date(`${calendar}T00:00:00Z`);
  if (Number.isNaN(dateOnly.valueOf()) || dateOnly.toISOString().slice(0, 10) !== calendar)
    return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf())) return null;
  return value.length === 10 ? value : thailandDay(parsed);
}

export function daysUntil(day: string, today: string = thailandDay()): number {
  return Math.round((Date.parse(`${day}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / DAY_MS);
}
