import React from 'react';
import { Icon } from '@/assets/icons';

export function Select({ label, options, value, onChange, className = '', disabled, 'aria-label': ariaLabel }: {
  label?: string; options: { label: string; value: string }[]; value?: string;
  onChange?: (v: string) => void; className?: string; disabled?: boolean;
  /** Accessible name for filter-style selects that render no visible label. */
  'aria-label'?: string;
}) {
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      {label && <label className="text-sm font-medium text-content-secondary">{label}</label>}
      <div className="relative">
        <select
          value={value}
          onChange={e => onChange?.(e.target.value)}
          disabled={disabled}
          aria-label={ariaLabel}
          className={`w-full h-9 pl-3 pr-9 rounded-[10px] border border-line bg-surface text-base text-content appearance-none focus:outline-none focus:ring-2 focus:ring-brand-600/20 focus:border-brand-600 transition-all ${disabled ? 'cursor-not-allowed bg-surface-alt text-content-subtle' : 'cursor-pointer'}`}
        >
          {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <Icon.ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-content-subtle pointer-events-none" />
      </div>
    </div>
  );
}
