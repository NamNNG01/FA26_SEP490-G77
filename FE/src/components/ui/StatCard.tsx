import React from 'react';
import { Icon } from '@/assets/icons';

export function StatCard({ title, value, change, changeLabel, icon, color = '#2563EB' }: {
  title: string; value: string; change?: number; changeLabel?: string; icon: React.ReactNode; color?: string;
}) {
  return (
    <div className="card p-5 flex flex-col gap-4">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[13px] text-[#6B7280] font-medium">{title}</p>
          <p className="text-[28px] font-bold text-[#111827] mt-1 leading-none">{value}</p>
        </div>
        <div className="w-11 h-11 rounded-[10px] flex items-center justify-center flex-shrink-0" style={{ background: `${color}15` }}>
          <div className="w-5 h-5" style={{ color }}>{icon}</div>
        </div>
      </div>
      {change !== undefined && (
        <div className="flex items-center gap-1.5">
          <div className={`flex items-center gap-0.5 text-[13px] font-medium ${change >= 0 ? 'text-[#16A34A]' : 'text-[#DC2626]'}`}>
            {change >= 0 ? <Icon.ArrowUp className="w-3.5 h-3.5" /> : <Icon.ArrowDown className="w-3.5 h-3.5" />}
            {Math.abs(change)}%
          </div>
          {changeLabel && <span className="text-[13px] text-[#9CA3AF]">{changeLabel}</span>}
        </div>
      )}
    </div>
  );
}
