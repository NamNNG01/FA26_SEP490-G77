import React from 'react';
import type { CategoryResponse } from '@/services/course.service';

/** Selected category id, or 'all'. */
export type CategoryFilter = number | 'all';

/**
 * CourseFilterChips
 *
 * Single-select category filter for the course grid (categories from
 * PUB-01). Renders nothing until there are categories to pick from.
 */
export function CourseFilterChips({
  categories,
  value,
  onChange,
  className = '',
}: {
  categories: CategoryResponse[];
  value: CategoryFilter;
  onChange: (next: CategoryFilter) => void;
  className?: string;
}) {
  if (categories.length === 0) return null;
  return (
    <div role="group" aria-label="Filter courses by category" className={`flex flex-wrap gap-2 ${className}`}>
      <FilterChip label="All" active={value === 'all'} onClick={() => onChange('all')} />
      {categories.map((category) => (
        <FilterChip
          key={category.categoryId}
          label={category.name}
          active={value === category.categoryId}
          onClick={() => onChange(category.categoryId)}
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
