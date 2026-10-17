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
  default: 'bg-surface-muted text-content-secondary',
  success: 'bg-success-light text-success',
  warning: 'bg-warning-light text-warning',
  danger: 'bg-danger-light text-danger',
  info: 'bg-primary-light text-brand-ink',
  purple: 'bg-purple-light text-purple',
};

export function Badge({ variant = 'default', children, className = '' }: { variant?: BadgeVariant; children: React.ReactNode; className?: string }) {
  return <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${badgeVariants[variant]} ${className}`}>{children}</span>;
}

export function Chip({ children, onRemove, active, onClick }: { children: React.ReactNode; onRemove?: () => void; active?: boolean; onClick?: () => void }) {
  return (
    <span
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium border transition-all cursor-pointer
        ${active ? 'bg-primary-light text-brand-ink border-brand-line' : 'bg-surface text-content-secondary border-line hover:bg-surface-hover'}`}
    >
      {children}
      {onRemove && <button onClick={e => { e.stopPropagation(); onRemove(); }} className="text-content-subtle hover:text-content-secondary"><Icon.X className="w-3 h-3" /></button>}
    </span>
  );
}
