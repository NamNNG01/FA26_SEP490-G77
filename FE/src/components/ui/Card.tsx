import React from 'react';

export function Card({ children, className = '', onClick }: { children: React.ReactNode; className?: string; onClick?: () => void }) {
  return <div className={`card ${onClick ? 'cursor-pointer hover:shadow-md transition-shadow' : ''} ${className}`} onClick={onClick}>{children}</div>;
}

export function SectionHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <h2 className="text-[20px] font-bold text-[#111827]">{title}</h2>
        {subtitle && <p className="text-[14px] text-[#6B7280] mt-1">{subtitle}</p>}
      </div>
      {action && <div className="flex-shrink-0">{action}</div>}
    </div>
  );
}

export function EmptyState({ icon, title, message, action }: { icon?: React.ReactNode; title: string; message?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-8 text-center">
      {icon && <div className="w-16 h-16 rounded-2xl bg-[#F3F4F6] flex items-center justify-center mb-4 text-[#9CA3AF]">{icon}</div>}
      <h3 className="text-[16px] font-semibold text-[#111827] mb-2">{title}</h3>
      {message && <p className="text-[14px] text-[#6B7280] max-w-xs mb-6">{message}</p>}
      {action}
    </div>
  );
}
