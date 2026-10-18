import React from 'react';
import { Icon } from '@/assets/icons';

/** Clickable table header cell; the active column shows its sort arrow. */
export function SortHeader({
  label,
  active,
  direction = 'desc',
  align = 'left',
  onClick,
}: {
  label: string;
  active: boolean;
  direction?: 'asc' | 'desc';
  align?: 'left' | 'right';
  onClick: () => void;
}) {
  return (
    <th
      className={`px-5 py-2.5 font-medium ${align === 'right' ? 'text-right' : ''}`}
      aria-sort={active ? (direction === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      <button
        type="button"
        onClick={onClick}
        className={`inline-flex items-center gap-1 cursor-pointer rounded hover:text-content focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600/30 ${
          active ? 'text-content font-semibold' : ''
        }`}
      >
        {label}
        {active ? (
          direction === 'asc' ? <Icon.ArrowUp className="w-3.5 h-3.5" /> : <Icon.ArrowDown className="w-3.5 h-3.5" />
        ) : (
          <Icon.SortAsc className="w-3.5 h-3.5 opacity-40" />
        )}
      </button>
    </th>
  );
}
