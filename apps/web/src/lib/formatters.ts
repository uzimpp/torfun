export function formatBudget(value?: number) {
  return value
    ? new Intl.NumberFormat('th-TH', { maximumFractionDigits: 0 }).format(value)
    : 'ไม่ระบุ';
}

export function formatThaiDate(value: Date) {
  return new Intl.DateTimeFormat('th-TH', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(value);
}

export function formatMatch(score?: number) {
  return score === undefined ? 'ยังไม่ประเมิน' : `${Math.round(score * 100)}% ความเหมาะสม`;
}
