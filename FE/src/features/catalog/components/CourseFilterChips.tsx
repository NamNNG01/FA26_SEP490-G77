import React from 'react';
import { COURSE_PROVIDERS } from '../data/providers';
import type { CourseProviderId } from '../types';

/**
 * CourseFilterChips
 *
 * Single-select provider filter for the course grid. Courses only — no
 * difficulty / rating / date facets yet, deliberately.
 */
export function CourseFilterChips({
  value,
  onChange,
  className = '',
}: {
  value: CourseProviderId | 'all';
  onChange: (next: CourseProviderId | 'all') => void;
  className?: string;
}) {
  return (
    <div role="group" aria-label="Filter courses by provider" className={`flex flex-wrap gap-2 ${className}`}>
      <FilterChip label="All" active={value === 'all'} onClick={() => onChange('all')} />
      {COURSE_PROVIDERS.map((provider) => (
        <FilterChip
          key={provider.id}
          label={provider.shortLabel}
          active={value === provider.id}
          onClick={() => onChange(provider.id)}
        />
      ))}
    </div>
  );
}

function FilterChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`h-9 rounded-full border px-4 text-[13px] font-medium transition-all cursor-pointer ${
        active
          ? 'border-[#0D7C6C] bg-[#0D7C6C] text-white shadow-sm shadow-[#0D7C6C]/25'
          : 'border-[#E5E7EB] bg-white text-[#374151] hover:border-[#A7DCCF] hover:text-[#0D7C6C] dark:border-[#1F2937] dark:bg-[#111827] dark:text-[#D1D5DB] dark:hover:border-[#0F3B35] dark:hover:text-white'
      }`}
    >
      {label}
    </button>
  );
}