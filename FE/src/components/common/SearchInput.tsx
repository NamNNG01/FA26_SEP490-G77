import React from 'react';
import { Icon } from '@/assets/icons';

export function SearchInput({ className = '', ...props }: React.InputHTMLAttributes<HTMLInputElement> & { className?: string }) {
  return (
    <div className={`relative flex items-center ${className}`}>
      <Icon.Search className="absolute left-3 w-4 h-4 text-[#9CA3AF]" />
      <input
        className="w-full h-9 pl-9 pr-3 rounded-[10px] border border-[#E5E7EB] bg-white text-[14px] placeholder:text-[#9CA3AF] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB] transition-all"
        {...props}
      />
    </div>
  );
}
