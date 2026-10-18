import type { Granularity } from '../data/adminDashboardDemo';

const vndFormatter = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 });
const integerFormatter = new Intl.NumberFormat('vi-VN');

/** 1250000 → "1.250.000 ₫" */
export function formatVnd(value: number): string {
  return vndFormatter.format(value);
}

/** 1284 → "1.284" */
export function formatInteger(value: number): string {
  return integerFormatter.format(value);
}

/** 1_234_567 → "1,2M", 45_300 → "45,3K" (Vietnamese decimal comma). */
export function formatCompact(value: number): string {
  const units: [number, string][] = [
    [1e9, 'B'],
    [1e6, 'M'],
    [1e3, 'K'],
  ];
  for (const [size, suffix] of units) {
    if (Math.abs(value) >= size) {
      const scaled = value / size;
      const text = scaled >= 100 ? Math.round(scaled).toString() : scaled.toFixed(1).replace(/\.0$/, '');
      return `${text.replace('.', ',')}${suffix}`;
    }
  }
  return String(value);
}

/** Axis/tooltip label for one period key. */
export function formatPeriod(period: string, granularity: Granularity, short = false): string {
  if (granularity === 'year') return period;
  if (granularity === 'month') {
    const [y, m] = period.split('-');
    return short ? `${m}/${y.slice(2)}` : `${m}/${y}`;
  }
  const [y, m, d] = period.split('-');
  return short ? `${d}/${m}` : `${d}/${m}/${y}`;
}

/** "2026-10-18T09:05:00" → "18/10/2026 09:05" */
export function formatDateTime(iso: string): string {
  const [date, time = ''] = iso.split('T');
  return `${formatPeriod(date, 'day')} ${time.slice(0, 5)}`.trim();
}
