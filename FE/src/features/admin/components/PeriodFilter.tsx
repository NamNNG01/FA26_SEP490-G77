import React from 'react';
import { Tabs } from '@/components/ui/Tabs';
import { Select } from '@/components/ui/Select';
import { defaultFilter, toIsoDate, type DashboardFilter, type Granularity } from '../data/adminDashboardDemo';

const GRANULARITY_TABS: { label: string; value: Granularity }[] = [
  { label: 'Day', value: 'day' },
  { label: 'Month', value: 'month' },
  { label: 'Year', value: 'year' },
];

const inputClass =
  'h-9 px-3 rounded-[10px] border border-line bg-surface text-base text-content focus:outline-none focus:ring-2 focus:ring-brand-600/20 focus:border-brand-600 transition-all';

/**
 * Two-step period picker: choose Day / Month / Year first, then a from–to
 * range in that unit. Switching unit resets the range to its default
 * (last 7 days, last 6 months, last 3 years). Ranges never run past today
 * and "from" can never be after "to" — editing one end pulls the other along.
 */
export function PeriodFilter({
  value,
  onChange,
  minDate,
}: {
  value: DashboardFilter;
  onChange: (next: DashboardFilter) => void;
  /** Earliest selectable day (YYYY-MM-DD). */
  minDate: string;
}) {
  const today = toIsoDate(new Date());
  const bounds = {
    day: { min: minDate, max: today },
    month: { min: minDate.slice(0, 7), max: today.slice(0, 7) },
    year: { min: minDate.slice(0, 4), max: today.slice(0, 4) },
  }[value.granularity];

  // ISO strings of equal length compare correctly as plain strings.
  const clamp = (v: string) => (v < bounds.min ? bounds.min : v > bounds.max ? bounds.max : v);

  const setFrom = (raw: string) => {
    if (!raw) return;
    const from = clamp(raw);
    onChange({ ...value, from, to: from > value.to ? from : value.to });
  };
  const setTo = (raw: string) => {
    if (!raw) return;
    const to = clamp(raw);
    onChange({ ...value, to, from: to < value.from ? to : value.from });
  };

  const years = Array.from({ length: Number(bounds.max) - Number(bounds.min) + 1 }, (_, i) => {
    const y = String(Number(bounds.min) + i);
    return { label: y, value: y };
  });

  const activeLabel = GRANULARITY_TABS.find((t) => t.value === value.granularity)!.label;

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Tabs
        tabs={GRANULARITY_TABS.map((t) => t.label)}
        active={activeLabel}
        onChange={(label) => {
          const g = GRANULARITY_TABS.find((t) => t.label === label)!.value;
          if (g !== value.granularity) onChange(defaultFilter(g));
        }}
      />
      <div className="flex items-center gap-2">
        {value.granularity === 'year' ? (
          <>
            <Select aria-label="From year" value={value.from} onChange={setFrom} options={years} className="w-24" />
            <span className="text-sm text-content-subtle">to</span>
            <Select aria-label="To year" value={value.to} onChange={setTo} options={years} className="w-24" />
          </>
        ) : (
          <>
            <input
              type={value.granularity === 'day' ? 'date' : 'month'}
              aria-label="From"
              value={value.from}
              min={bounds.min}
              max={bounds.max}
              onChange={(e) => setFrom(e.target.value)}
              className={inputClass}
            />
            <span className="text-sm text-content-subtle">to</span>
            <input
              type={value.granularity === 'day' ? 'date' : 'month'}
              aria-label="To"
              value={value.to}
              min={bounds.min}
              max={bounds.max}
              onChange={(e) => setTo(e.target.value)}
              className={inputClass}
            />
          </>
        )}
      </div>
    </div>
  );
}
