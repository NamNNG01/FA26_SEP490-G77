import React from 'react';

export function Tooltip({ label, children, side = 'top' }: {
  label: React.ReactNode;
  children: React.ReactNode;
  side?: 'top' | 'bottom';
}) {
  const pos = side === 'top'
    ? '-top-1 left-0 translate-y-[-100%] mb-1'
    : '-bottom-1 left-0 translate-y-[100%] mt-1';
  return (
    <span className="relative inline-flex group">
      {children}
      <span className={`pointer-events-none absolute z-20 ${pos} hidden group-hover:block whitespace-nowrap bg-[#111827] text-white text-[11px] px-2.5 py-1.5 rounded-[8px] shadow-lg`}>
        {label}
      </span>
    </span>
  );
}