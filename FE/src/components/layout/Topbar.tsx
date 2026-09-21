import React from 'react';
import { Icon } from '@/assets/icons';
import { Avatar } from '@/components/ui/Avatar';
import { SearchInput } from '@/components/common/SearchInput';

export function Topbar({ title, user, onMenuToggle, notifications = 3 }: {
  title?: string; user?: { name: string; role: string }; onMenuToggle?: () => void; notifications?: number;
}) {
  return (
    <header className="h-14 bg-white border-b border-[#F3F4F6] flex items-center px-4 gap-3 flex-shrink-0">
      {onMenuToggle && (
        <button onClick={onMenuToggle} className="text-[#6B7280] hover:text-[#374151] p-1.5 rounded-[8px] hover:bg-[#F3F4F6]">
          <Icon.List className="w-5 h-5" />
        </button>
      )}
      {title && <h1 className="text-[15px] font-semibold text-[#111827]">{title}</h1>}
      <div className="flex-1" />
      <button className="relative p-2 text-[#6B7280] hover:text-[#374151] hover:bg-[#F3F4F6] rounded-[8px] transition-colors">
        <Icon.Bell className="w-5 h-5" />
        {notifications > 0 && <span className="absolute top-1 right-1 w-2 h-2 bg-[#DC2626] rounded-full" />}
      </button>
      {user && (
        <div className="flex items-center gap-2.5 ml-1">
          <Avatar name={user.name} size="sm" />
          <div className="hidden sm:block">
            <p className="text-[13px] font-semibold text-[#111827] leading-tight">{user.name}</p>
            <p className="text-[11px] text-[#9CA3AF] leading-tight">{user.role}</p>
          </div>
        </div>
      )}
    </header>
  );
}

export function AppTopbar({ user, notifications = 3 }: {
  user?: { name: string; role: string }; onMenuToggle?: () => void; notifications?: number;
}) {
  return (
    <header className="h-14 bg-white border-b border-[#F3F4F6] flex items-center px-4 gap-3 flex-shrink-0 sticky top-0 z-40">
      <div className="flex items-center gap-2.5 w-56 flex-shrink-0">
        <div className="w-7 h-7 bg-[#2563EB] rounded-[8px] flex items-center justify-center">
          <Icon.Brain className="w-4 h-4 text-white" />
        </div>
        <span className="text-[15px] font-bold text-[#111827]">CertifyAI</span>
      </div>
      <div className="flex-1" />
      <SearchInput className="w-64" placeholder="Search…" />
      <button className="relative p-2 text-[#6B7280] hover:text-[#374151] hover:bg-[#F3F4F6] rounded-[8px] transition-colors">
        <Icon.Bell className="w-5 h-5" />
        {notifications > 0 && <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-[#DC2626] rounded-full" />}
      </button>
      {user && (
        <div className="flex items-center gap-2.5 ml-1 pl-3 border-l border-[#F3F4F6]">
          <Avatar name={user.name} size="sm" />
          <div className="hidden sm:block">
            <p className="text-[13px] font-semibold text-[#111827] leading-tight">{user.name}</p>
            <p className="text-[11px] text-[#9CA3AF] leading-tight capitalize">{user.role}</p>
          </div>
          <Icon.ChevronDown className="w-4 h-4 text-[#9CA3AF]" />
        </div>
      )}
    </header>
  );
}
