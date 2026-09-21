import React from 'react';

export function Input({
  label, error, hint, className = '', icon, suffix, ...props
}: {
  label?: string; error?: string; hint?: string; className?: string;
  icon?: React.ReactNode; suffix?: React.ReactNode;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      {label && <label className="text-[13px] font-medium text-[#374151]">{label}</label>}
      <div className="relative flex items-center">
        {icon && <span className="absolute left-3 text-[#9CA3AF] w-4 h-4 flex items-center">{icon}</span>}
        <input
          className={`w-full h-9 rounded-[10px] border text-[14px] text-[#111827] placeholder:text-[#9CA3AF] bg-white transition-all
            focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB]
            ${error ? 'border-[#DC2626]' : 'border-[#E5E7EB]'}
            ${icon ? 'pl-9' : 'pl-3'} ${suffix ? 'pr-10' : 'pr-3'}`}
          {...props}
        />
        {suffix && <span className="absolute right-3 text-[#9CA3AF]">{suffix}</span>}
      </div>
      {error && <p className="text-[12px] text-[#DC2626]">{error}</p>}
      {hint && !error && <p className="text-[12px] text-[#6B7280]">{hint}</p>}
    </div>
  );
}
