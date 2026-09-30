/**
 * Dates are stored as ISO 8601 UTC timestamps, like `discovered_at`, so a range
 * filter can compare them. The e-GP open-data API returns `announce_date` as
 * Thai display text (`26 มิ.ย. 69` — Buddhist-era year, two digits) or `-` when
 * unknown.
 */

const THAI_MONTHS: Record<string, number> = {
  'ม.ค.': 1,
  มกราคม: 1,
  'ก.พ.': 2,
  กุมภาพันธ์: 2,
  'มี.ค.': 3,
  มีนาคม: 3,
  'เม.ย.': 4,
  เมษายน: 4,
  'พ.ค.': 5,
  พฤษภาคม: 5,
  'มิ.ย.': 6,
  มิถุนายน: 6,
  'ก.ค.': 7,
  กรกฎาคม: 7,
  'ส.ค.': 8,
  สิงหาคม: 8,
  'ก.ย.': 9,
  กันยายน: 9,
  'ต.ค.': 10,
  ตุลาคม: 10,
  'พ.ย.': 11,
  พฤศจิกายน: 11,
  'ธ.ค.': 12,
  ธันวาคม: 12,
};

const BUDDHIST_ERA_OFFSET = 543;

/** Two-digit years are Buddhist-era shorthand: 69 → 2569 → 2026. */
function toGregorianYear(year: number, digits: number): number {
  const buddhist = digits <= 2 ? 2500 + year : year;
  return buddhist > 2400 ? buddhist - BUDDHIST_ERA_OFFSET : buddhist;
}

/** The calendar day as `YYYY-MM-DD`, or null if that day does not exist. */
function toDay(year: number, month: number, day: number): string | null {
  const date = new Date(Date.UTC(year, month - 1, day));
  const exists =
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
  return exists ? date.toISOString().slice(0, 10) : null;
}

const MIDNIGHT_UTC = 'T00:00:00.000Z';

/** A time written with no offset is Thailand time: these are Thai tenders. */
const THAILAND_OFFSET = '+07:00';

/**
 * ISO (`2026-10-15`, optionally with a time) or Thai (`26 มิ.ย. 69`) date to an
 * ISO 8601 UTC timestamp, the same shape as `discovered_at`; null if unreadable.
 * A date with no time is midnight UTC, which is where the range filters draw
 * their day boundaries.
 */
export function convertDateToISO(value: string | null | undefined): string | null {
  const text = value?.trim();
  if (!text) return null;

  const iso =
    /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?)\s*(Z|[+-]\d{2}:?\d{2})?)?$/.exec(
      text,
    );
  if (iso) {
    const day = toDay(toGregorianYear(Number(iso[1]), 4), Number(iso[2]), Number(iso[3]));
    if (!day) return null;
    if (!iso[4]) return `${day}${MIDNIGHT_UTC}`;
    const offset = iso[5]?.replace(/^([+-]\d{2})(\d{2})$/, '$1:$2') ?? THAILAND_OFFSET;
    const instant = new Date(`${day}T${iso[4]}${offset}`);
    return Number.isNaN(instant.valueOf()) ? null : instant.toISOString();
  }

  const thai = /^(\d{1,2})\s+(\S+)\s+(\d{2}|\d{4})$/.exec(text);
  const month = thai ? THAI_MONTHS[thai[2]!] : undefined;
  if (thai && month) {
    const day = toDay(toGregorianYear(Number(thai[3]), thai[3]!.length), month, Number(thai[1]));
    return day && `${day}${MIDNIGHT_UTC}`;
  }

  return null;
}
