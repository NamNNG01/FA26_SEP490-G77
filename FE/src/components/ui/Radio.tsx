import React from 'react';

export function Radio({ label, checked, onChange }: { label?: string; checked?: boolean; onChange?: () => void }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer select-none group" onClick={onChange}>
      <div className={`w-[18px] h-[18px] rounded-full border-2 flex items-center justify-center transition-all
        ${checked ? 'border-brand-600' : 'border-line-strong group-hover:border-brand-600'}`}>
        {checked && <div className="w-2 h-2 rounded-full bg-brand-600" />}
      </div>
      {label && <span className="text-base text-content-secondary">{label}</span>}
    </label>
  );
}
