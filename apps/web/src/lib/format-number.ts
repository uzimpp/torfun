const countFormat = new Intl.NumberFormat('th-TH');

const compactFormat = new Intl.NumberFormat('th-TH', {
  notation: 'compact',
  maximumFractionDigits: 1,
});

/** A count with thousands separators, the same on every admin page. */
export function formatCount(value: number): string {
  return countFormat.format(value);
}

/** A large count shortened for a chart caption, e.g. "1.2M". */
export function formatCompact(value: number): string {
  return compactFormat.format(value);
}
