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
      className={`h-9 rounded-full border px-4 text-sm font-medium transition-all cursor-pointer ${
        active
          ? 'border-brand-600 bg-brand-600 text-white shadow-sm shadow-brand-600/25'
          : 'border-line bg-surface text-content-secondary hover:border-brand-line hover:text-brand-ink'
      }`}
    >
      {label}
    </button>
  );
}