import type { MilestoneKey, Procurement } from '@torfun/types';

export function formatThb(amount: number | null): string {
  if (amount === null) return '—';
  return amount.toLocaleString('th-TH', { maximumFractionDigits: 0 });
}

/**
 * The documents that turned out to be TORs. Not `documents.length`: a candidate
 * that matched the filename pattern but read as something else is listed too.
 */
export function countTorDocuments(record: Procurement): number {
  return record.documents.filter(
    (document) => document.role === 'main_tor' || document.role === 'tor_variant',
  ).length;
}

export function hasTorSource(record: Procurement): boolean {
  return record.zipId !== null && record.documents.some((document) => document.role === 'main_tor');
}

export const MILESTONE_LABELS: Record<MilestoneKey, string> = {
  drafted: 'ร่างประกาศ / TOR',
  invited: 'ประกาศเชิญชวน',
  priced: 'ยื่นและเปิดซอง',
  evaluated: 'ผลการพิจารณา',
  awarded: 'ประกาศผู้ชนะ',
  contracted: 'ลงนามสัญญา',
};
