import React from 'react';
import { Icon } from '@/assets/icons';

export function Breadcrumb({ items }: { items: { label: string; onClick?: () => void }[] }) {
  return (
    <nav className="flex items-center gap-1.5">
      {items.map((item, i) => (
        <React.Fragment key={i}>
          {i > 0 && <Icon.ChevronRight className="w-3.5 h-3.5 text-[#9CA3AF]" />}
          <span
            onClick={item.onClick}
            className={`text-[13.5px] ${item.onClick ? 'text-[#2563EB] hover:underline cursor-pointer' : 'text-[#6B7280]'}`}
          >
            {item.label}
          </span>
        </React.Fragment>
      ))}
    </nav>
  );
}
