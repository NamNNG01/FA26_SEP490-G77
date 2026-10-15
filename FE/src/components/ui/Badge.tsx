import React from 'react';
import { Icon } from '@/assets/icons';

export type BadgeVariant = 'default' | 'success' | 'warning' | 'danger' | 'info' | 'purple';

/**
 * Light values are unchanged; the `dark:` pair is the matching Tailwind shade so
 * the chip stops rendering near-white on a dark surface. The centralized
 * `.dark` remaps in styles/index.css only cover a handful of legacy hexes and
 * none of these chip backgrounds, so the variants have to carry their own.
 * Every dark pair clears 4.5:1.
 */
const badgeVariants: Record<BadgeVariant, string> = {
  default: 'bg-[#F3F4F6] text-[#374151] dark:bg-[#1F2937] dark:text-[#F9FAFB]',
  success: 'bg-[#F0FDF4] text-[#16A34A] dark:bg-[#052E16] dark:text-[#4ADE80]',
  warning: 'bg-[#FFFBEB] text-[#D97706] dark:bg-[#422006] dark:text-[#FBBF24]',
  danger: 'bg-[#FEF2F2] text-[#DC2626] dark:bg-[#450A0A] dark:text-[#F87171]',
  info: 'bg-[#EFF6FF] text-[#2563EB] dark:bg-[#172554] dark:text-[#93C5FD]',
  purple: 'bg-[#F5F3FF] text-[#7C3AED] dark:bg-[#2E1065] dark:text-[#C4B5FD]',
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
