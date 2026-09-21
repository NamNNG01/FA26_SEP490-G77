import React from 'react';
import { Icon } from '@/assets/icons';

export function TimerDisplay({ seconds, warning }: { seconds: number; warning?: boolean }) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const fmt = (n: number) => String(n).padStart(2, '0');
  return (
    <div className={`flex items-center gap-1.5 font-mono text-[22px] font-bold ${warning ? 'text-[#DC2626]' : 'text-[#111827]'}`}>
      <Icon.Clock className={`w-5 h-5 ${warning ? 'text-[#DC2626]' : 'text-[#6B7280]'}`} />
      {h > 0 && <>{fmt(h)}:</>}{fmt(m)}:{fmt(s)}
    </div>
  );
}
