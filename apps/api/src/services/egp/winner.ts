import type { Winner } from '@torfun/types';

/**
 * Reads the `contract` field of an `egp-contract` row into a `Winner`.
 *
 * Upstream sends an array, though every project sampled had exactly one entry.
 * Where there is more than one, the largest by agreed price is taken as the
 * award and the rest are ignored — better than picking arbitrarily, and the
 * case has not been observed in the wild.
 */

interface RawContract {
  winner_name?: string;
  winner_tin?: string;
  contract_no?: string;
  contract_date?: string;
  contract_finish_date?: string;
  price_agree?: number;
}

/** A number upstream omitted stays null: 0 would average as "won for nothing". */
function money(value: number | undefined): number | null {
  return typeof value === 'number' ? value : null;
}

export function toWinner(raw: unknown): Winner | null {
  const entries: RawContract[] = Array.isArray(raw)
    ? (raw as RawContract[])
    : raw && typeof raw === 'object'
      ? [raw as RawContract]
      : [];

  const named = entries.filter((entry) => (entry.winner_name ?? '').trim().length > 0);
  if (named.length === 0) return null;

  const best = named.reduce((a, b) => ((b.price_agree ?? 0) > (a.price_agree ?? 0) ? b : a));

  return {
    name: best.winner_name!.trim(),
    taxId: (best.winner_tin ?? '').trim(),
    contractNo: (best.contract_no ?? '').trim(),
    contractDate: best.contract_date ?? null,
    contractFinishDate: best.contract_finish_date ?? null,
    priceAgree: money(best.price_agree),
  };
}
