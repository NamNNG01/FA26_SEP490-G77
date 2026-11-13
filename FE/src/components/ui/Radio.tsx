import React from 'react';

export function Radio({ label, checked, onChange, disabled = false }: { label?: string; checked?: boolean; onChange?: () => void; disabled?: boolean }) {
  return (
    <label className={`flex items-center gap-2 select-none group ${disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`} onClick={disabled ? undefined : onChange} aria-disabled={disabled || undefined}>
      <div className={`w-[18px] h-[18px] rounded-full border-2 flex items-center justify-center transition-all
        ${checked ? 'border-brand-600' : 'border-line-strong group-hover:border-brand-600'}`}>
        {checked && <div className="w-2 h-2 rounded-full bg-brand-600" />}
      </div>
      {label && <span className="text-base text-content-secondary">{label}</span>}
    </label>
  );
}
