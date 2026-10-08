const TIME_ZONE = 'Asia/Bangkok';

const dateFormat = new Intl.DateTimeFormat('th-TH', {
  dateStyle: 'long',
  timeZone: TIME_ZONE,
});

const dateTimeFormat = new Intl.DateTimeFormat('th-TH', {
  dateStyle: 'long',
  timeStyle: 'short',
  timeZone: TIME_ZONE,
});

const shortDateFormat = new Intl.DateTimeFormat('th-TH', {
  day: 'numeric',
  month: 'short',
  timeZone: TIME_ZONE,
});

const shortDateTimeFormat = new Intl.DateTimeFormat('th-TH', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: TIME_ZONE,
});

/**
 * An ISO timestamp as a Thai date ("26 มิถุนายน 2569", Buddhist era).
 *
 * The API sends ISO 8601 and the client decides how to show it: the wire format
 * stays locale-free, and the zone is pinned to Bangkok so server and browser
 * render the same day. `withTime` adds the clock time, for deadlines. A value
 * that does not parse is returned as received rather than shown as "Invalid Date".
 */
export function formatThaiDate(iso: string, { withTime = false } = {}): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return iso;
  return (withTime ? dateTimeFormat : dateFormat).format(at);
}

/** "27 มิ.ย.": a day where the year is obvious, such as a 30-day chart axis. */
export function formatShortDate(iso: string): string {
  const at = new Date(iso);
  return Number.isNaN(at.getTime()) ? iso : shortDateFormat.format(at);
}

/** "26 มิ.ย. 16:30": a recent moment, such as when a run started. */
export function formatShortDateTime(iso: string): string {
  const at = new Date(iso);
  return Number.isNaN(at.getTime()) ? iso : shortDateTimeFormat.format(at);
}
