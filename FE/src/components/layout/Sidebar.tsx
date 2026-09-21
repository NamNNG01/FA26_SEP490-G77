import React from 'react';

export function Sidebar({ nav, active, onSelect, collapsed }: {
  nav: { section?: string; items: { id: string; label: string; icon: React.ReactNode; badge?: number }[] }[];
  active: string;
  onSelect: (id: string) => void;
  collapsed?: boolean;
}) {
  return (
    <div className={`flex flex-col h-full overflow-y-auto ${collapsed ? 'w-16' : 'w-56'} transition-all`}>
      {nav.map((group, gi) => (
        <div key={gi} className={gi > 0 ? 'mt-4' : ''}>
          {group.section && !collapsed && <p className="px-3 mb-1.5 text-[11px] font-semibold text-[#9CA3AF] uppercase tracking-wider">{group.section}</p>}
          {group.items.map(item => (
            <button key={item.id} onClick={() => onSelect(item.id)}
              className={`sidebar-link w-full ${active === item.id ? 'active' : ''} ${collapsed ? 'justify-center px-0' : ''}`}>
              <span className="w-4 h-4 flex-shrink-0">{item.icon}</span>
              {!collapsed && <span className="flex-1">{item.label}</span>}
              {!collapsed && item.badge !== undefined && item.badge > 0 && (
                <span className="w-5 h-5 bg-[#2563EB] text-white rounded-full text-[11px] font-semibold flex items-center justify-center">{item.badge}</span>
              )}
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}
