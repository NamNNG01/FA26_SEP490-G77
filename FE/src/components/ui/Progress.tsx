import React from 'react';

export function Progress({ value, max = 100, color = '#0D7C6C', size = 'md', label }: { value: number; max?: number; color?: string; size?: 'sm' | 'md' | 'lg'; label?: string }) {
  const pct = Math.round((value / max) * 100);
  const h = size === 'sm' ? 'h-1.5' : size === 'lg' ? 'h-3' : 'h-2';
  return (
    <div className="flex flex-col gap-1">
      {label && <div className="flex justify-between"><span className="text-xs text-content-soft">{label}</span><span className="text-xs font-medium text-content-secondary">{pct}%</span></div>}
      <div className={`w-full ${h} bg-surface-muted rounded-full overflow-hidden`}>
        <div className={`${h} rounded-full transition-all duration-500`} style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}
