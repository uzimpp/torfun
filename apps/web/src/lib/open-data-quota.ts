import { OPEN_DATA_SWEEP_CALLS, type OpenDataQuota } from '@torfun/types';
import { formatCount as count } from './format-number';

const bangkokDay = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' });

/**
 * The reading, if it was taken on the same Bangkok day as `now`. The allowance
 * resets daily, so an older reading is unknown rather than a stale figure.
 */
export function todaysQuota(quota: OpenDataQuota | null, now: Date): OpenDataQuota | null {
  if (!quota) return null;
  const observed = new Date(quota.observedAt);
  if (Number.isNaN(observed.getTime())) return null;
  return bangkokDay.format(observed) === bangkokDay.format(now) ? quota : null;
}

/** Low means a full discovery sweep would be refused part-way. */
export function quotaIsLow(quota: OpenDataQuota | null, now: Date): boolean {
  const current = todaysQuota(quota, now);
  return current !== null && current.remainingDay < OPEN_DATA_SWEEP_CALLS;
}

/** "450/1,000", or "เหลือ 450" when the API gave no limit. */
export function quotaFigure(quota: OpenDataQuota): string {
  return quota.limitDay
    ? `${count(quota.remainingDay)}/${count(quota.limitDay)}`
    : `เหลือ ${count(quota.remainingDay)}`;
}

export function describeQuota(
  quota: OpenDataQuota | null,
  now: Date,
): { label: string; low: boolean } {
  const current = todaysQuota(quota, now);
  if (current === null) return { label: 'โควตา open-data: ยังไม่ทราบ', low: false };

  const of = current.limitDay ? `/${count(current.limitDay)}` : '';
  if (current.remainingDay === 0) {
    return {
      label: `โควตา open-data วันนี้หมดแล้ว (0${of}) — สแกนใหม่ได้หลังโควตารีเซ็ต`,
      low: true,
    };
  }
  const left = `โควตา open-data วันนี้เหลือ ${count(current.remainingDay)}${of}`;
  return current.remainingDay < OPEN_DATA_SWEEP_CALLS
    ? { label: `${left} — ไม่พอสำหรับสแกนเต็มรอบ`, low: true }
    : { label: left, low: false };
}
