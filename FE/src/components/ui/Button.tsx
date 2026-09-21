import React from 'react';

export type BtnVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
export type BtnSize = 'sm' | 'md' | 'lg';

const btnBase = 'inline-flex items-center justify-center gap-2 font-medium rounded-[10px] transition-all duration-150 cursor-pointer select-none disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap';
const btnVariants: Record<BtnVariant, string> = {
  primary: 'bg-[#2563EB] text-white hover:bg-[#1D4ED8] active:bg-[#1E40AF] shadow-sm',
  secondary: 'bg-[#F3F4F6] text-[#111827] hover:bg-[#E5E7EB] active:bg-[#D1D5DB]',
  outline: 'border border-[#E5E7EB] bg-white text-[#374151] hover:bg-[#F9FAFB] hover:border-[#D1D5DB]',
  ghost: 'text-[#374151] hover:bg-[#F3F4F6] active:bg-[#E5E7EB]',
  danger: 'bg-[#DC2626] text-white hover:bg-[#B91C1C] shadow-sm',
};
const btnSizes: Record<BtnSize, string> = {
  sm: 'h-8 px-3 text-[13px]',
  md: 'h-9 px-4 text-[14px]',
  lg: 'h-11 px-6 text-[15px]',
};

export function Button({
  variant = 'primary', size = 'md', className = '', children, icon, loading, ...props
}: {
  variant?: BtnVariant; size?: BtnSize; className?: string; children?: React.ReactNode;
  icon?: React.ReactNode; loading?: boolean;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button className={`${btnBase} ${btnVariants[variant]} ${btnSizes[size]} ${className}`} {...props}>
      {loading ? <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full spinner" /> : icon}
      {children}
    </button>
  );
}
