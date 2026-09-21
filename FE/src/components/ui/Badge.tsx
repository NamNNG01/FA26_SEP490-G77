import React from 'react';
import { Icon } from '@/assets/icons';

export type BadgeVariant = 'default' | 'success' | 'warning' | 'danger' | 'info' | 'purple';

const badgeVariants: Record<BadgeVariant, string> = {
  default: 'bg-[#F3F4F6] text-[#374151]',
  success: 'bg-[#F0FDF4] text-[#16A34A]',
  warning: 'bg-[#FFFBEB] text-[#D97706]',
  danger: 'bg-[#FEF2F2] text-[#DC2626]',
  info: 'bg-[#EFF6FF] text-[#2563EB]',
  purple: 'bg-[#F5F3FF] text-[#7C3AED]',
};

export function Badge({ variant = 'default', children, className = '' }: { variant?: BadgeVariant; children: React.ReactNode; className?: string }) {
  return <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[12px] font-medium ${badgeVariants[variant]} ${className}`}>{children}</span>;
}

export function Chip({ children, onRemove, active, onClick }: { children: React.ReactNode; onRemove?: () => void; active?: boolean; onClick?: () => void }) {
  return (
    <span
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[13px] font-medium border transition-all cursor-pointer
        ${active ? 'bg-[#EFF6FF] text-[#2563EB] border-[#BFDBFE]' : 'bg-white text-[#374151] border-[#E5E7EB] hover:bg-[#F9FAFB]'}`}
    >
      {children}
      {onRemove && <button onClick={e => { e.stopPropagation(); onRemove(); }} className="text-[#9CA3AF] hover:text-[#374151]"><Icon.X className="w-3 h-3" /></button>}
    </span>
  );
}
