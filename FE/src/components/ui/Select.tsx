import React from 'react';
import { Icon } from '@/assets/icons';

export function Select({ label, options, value, onChange, className = '' }: {
  label?: string; options: { label: string; value: string }[]; value?: string;
  onChange?: (v: string) => void; className?: string;
}) {
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      {label && <label className="text-[13px] font-medium text-[#374151]">{label}</label>}
      <div className="relative">
        <select
          value={value}
          onChange={e => onChange?.(e.target.value)}
          className="w-full h-9 pl-3 pr-9 rounded-[10px] border border-[#E5E7EB] bg-white text-[14px] text-[#111827] appearance-none focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB] transition-all cursor-pointer"
        >
          {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <Icon.ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#9CA3AF] pointer-events-none" />
      </div>
    </div>
  );
}
