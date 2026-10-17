import React from 'react';

export function Radio({ label, checked, onChange }: { label?: string; checked?: boolean; onChange?: () => void }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer select-none group" onClick={onChange}>
      <div className={`w-[18px] h-[18px] rounded-full border-2 flex items-center justify-center transition-all
        ${checked ? 'border-[#0D7C6C]' : 'border-[#D1D5DB] group-hover:border-[#0D7C6C]'}`}>
        {checked && <div className="w-2 h-2 rounded-full bg-[#0D7C6C]" />}
      </div>
      {label && <span className="text-[14px] text-[#374151]">{label}</span>}
    </label>
  );
}
