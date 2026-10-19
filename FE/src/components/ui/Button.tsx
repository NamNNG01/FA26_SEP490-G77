import React from 'react';

export type BtnVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
export type BtnSize = 'sm' | 'md' | 'lg';

const btnBase = 'inline-flex items-center justify-center gap-2 font-medium rounded-[10px] transition-all duration-150 cursor-pointer select-none disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap';
const btnVariants: Record<BtnVariant, string> = {
  primary: 'bg-brand-600 text-white hover:bg-brand-700 active:bg-brand-800 shadow-sm',
  secondary: 'bg-surface-muted text-content hover:bg-surface-pressed active:bg-surface-pressed-strong',
  outline: 'border border-line bg-surface text-content-secondary hover:bg-surface-hover hover:border-line-strong',
  ghost: 'text-content-secondary hover:bg-accent active:bg-surface-pressed',
  danger: 'bg-danger-solid text-white hover:bg-danger-solid-hover shadow-sm',
};
const btnSizes: Record<BtnSize, string> = {
  sm: 'h-8 px-3 text-sm',
  md: 'h-9 px-4 text-base',
  lg: 'h-11 px-6 text-lg',
};

export function Button({
  variant = 'primary', size = 'md', className = '', children, icon, iconRight, loading, ...props
}: {
  variant?: BtnVariant; size?: BtnSize; className?: string; children?: React.ReactNode;
  icon?: React.ReactNode;
  /** Trailing icon, e.g. a chevron on a "Next" button. */
  iconRight?: React.ReactNode;
  loading?: boolean;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button className={`${btnBase} ${btnVariants[variant]} ${btnSizes[size]} ${className}`} {...props}>
      {loading ? <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full spinner" /> : icon}
      {children}
      {!loading && iconRight}
    </button>
  );
}
