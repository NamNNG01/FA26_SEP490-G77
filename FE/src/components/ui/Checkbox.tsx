import React from 'react';
import { Icon } from '@/assets/icons';

export function Checkbox({ label, checked, onChange, indeterminate }: { label?: string; checked?: boolean; onChange?: (v: boolean) => void; indeterminate?: boolean }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer select-none group">
      <div
        onClick={() => onChange?.(!checked)}
        className={`w-[18px] h-[18px] rounded-[5px] border-2 flex items-center justify-center transition-all
          ${checked || indeterminate ? 'bg-[#2563EB] border-[#2563EB]' : 'border-[#D1D5DB] bg-white group-hover:border-[#2563EB]'}`}
      >
        {checked && <Icon.Check className="w-2.5 h-2.5 text-white" />}
        {indeterminate && !checked && <span className="w-2 h-0.5 bg-white rounded" />}
      </div>
      {label && <span className="text-[14px] text-[#374151]">{label}</span>}
    </label>
  );
}
