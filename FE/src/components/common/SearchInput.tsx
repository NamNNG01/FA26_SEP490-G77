import React from 'react';
import { Icon } from '@/assets/icons';

export function SearchInput({ className = '', ...props }: React.InputHTMLAttributes<HTMLInputElement> & { className?: string }) {
  return (
    <div className={`relative flex items-center ${className}`}>
      <Icon.Search className="absolute left-3 w-4 h-4 text-content-subtle" />
      <input
        className="w-full h-9 pl-9 pr-3 rounded-[10px] border border-line bg-surface text-base placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-600/20 focus:border-brand-600 transition-all"
        {...props}
      />
    </div>
  );
}
