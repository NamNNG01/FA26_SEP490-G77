import React from 'react';
import { Icon } from '@/assets/icons';

export function Breadcrumb({ items }: { items: { label: string; onClick?: () => void }[] }) {
  return (
    <nav className="flex flex-wrap items-center gap-x-1.5 gap-y-1 min-w-0" aria-label="Breadcrumb">
      {items.map((item, i) => (
        <React.Fragment key={i}>
          {i > 0 && <Icon.ChevronRight className="w-3.5 h-3.5 text-content-subtle flex-shrink-0" />}
          <span
            onClick={item.onClick}
            title={item.label}
            className={`text-sm min-w-0 max-w-[240px] truncate ${item.onClick ? 'text-brand-ink hover:underline cursor-pointer' : 'text-content-soft'}`}
          >
            {item.label}
          </span>
        </React.Fragment>
      ))}
    </nav>
  );
}
