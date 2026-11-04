import React from 'react';
import { Icon } from '@/assets/icons';

export function Checkbox({ label, checked, onChange, indeterminate, disabled }: { label?: string; checked?: boolean; onChange?: (v: boolean) => void; indeterminate?: boolean; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={indeterminate && !checked ? 'mixed' : checked || false}
      disabled={disabled}
      onClick={() => onChange?.(!checked)}
      className={`flex items-center gap-2 select-none text-left group ${disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
    >
      <div
        className={`w-[18px] h-[18px] rounded-[5px] border-2 flex items-center justify-center transition-all
          ${checked || indeterminate ? 'bg-brand-600 border-brand-600' : 'border-line-strong bg-surface group-hover:border-brand-600'} ${disabled ? 'cursor-not-allowed' : ''}`}
      >
        {checked && <Icon.Check className="w-2.5 h-2.5 text-white" />}
        {indeterminate && !checked && <span className="w-2 h-0.5 bg-surface rounded" />}
      </div>
      {label && <span className="text-base text-content-secondary">{label}</span>}
    </button>
  );
}
