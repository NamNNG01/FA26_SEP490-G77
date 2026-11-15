import type { DashboardFilter, Granularity } from '@/services/adminDashboard.service';

/**
 * Pure calendar helpers of the admin dashboard period picker. The figures come from the API; only
 * the filter's own bookkeeping (default ranges, the day window handed to the AI log table) lives
 * in the browser, on local calendar dates so no time zone shift slips a day.
 */

export function toIsoDate(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

function parseIsoDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

function addDays(d: Date, days: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + days);
}

/** Default range per unit: last 7 days, last 6 months, last 3 years (ending today). */
export function defaultFilter(granularity: Granularity, today = new Date()): DashboardFilter {
  if (granularity === 'month') {
    const from = new Date(today.getFullYear(), today.getMonth() - 5, 1);
    return { granularity, from: toIsoDate(from).slice(0, 7), to: toIsoDate(today).slice(0, 7) };
  }
  if (granularity === 'year') {
    return { granularity, from: String(today.getFullYear() - 2), to: String(today.getFullYear()) };
  }
  return { granularity, from: toIsoDate(addDays(today, -6)), to: toIsoDate(today) };
}

/**
 * First and last calendar day (YYYY-MM-DD) covered by a filter — the AI log table bounds its time
 * window with it. Never runs past today.
 */
export function filterDayRange(filter: DashboardFilter): { from: string; to: string } {
  const today = new Date();
  const todayDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  let start: Date;
  let end: Date;
  if (filter.granularity === 'day') {
    start = parseIsoDate(filter.from);
    end = parseIsoDate(filter.to);
  } else if (filter.granularity === 'month') {
    start = parseIsoDate(`${filter.from}-01`);
    const [y, m] = filter.to.split('-').map(Number);
    end = new Date(y, m, 0);
  } else {
    start = new Date(Number(filter.from), 0, 1);
    end = new Date(Number(filter.to), 11, 31);
  }
  return { from: toIsoDate(start), to: toIsoDate(end > todayDate ? todayDate : end) };
}
