import React from 'react';

export function Switch({ checked, onChange, label, size = 'md' }: { checked?: boolean; onChange?: (v: boolean) => void; label?: string; size?: 'sm' | 'md' }) {
  const w = size === 'sm' ? 'w-8 h-4' : 'w-11 h-6';
  const knob = size === 'sm' ? 'w-3 h-3 translate-x-0.5' : 'w-5 h-5 translate-x-0.5';
  const on = size === 'sm' ? 'translate-x-[17px]' : 'translate-x-[21px]';
  return (
    <label className="flex items-center gap-2 cursor-pointer select-none" onClick={() => onChange?.(!checked)}>
      <div className={`${w} rounded-full transition-colors ${checked ? 'bg-[#2563EB]' : 'bg-[#D1D5DB]'} relative`}>
        <div className={`${knob} bg-white rounded-full shadow absolute top-0.5 transition-transform ${checked ? on : ''}`} />
      </div>
      {label && <span className="text-[14px] text-[#374151]">{label}</span>}
    </label>
  );
}
