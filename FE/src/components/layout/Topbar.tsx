import React from 'react';
import { Icon } from '@/assets/icons';
import { Avatar } from '@/components/ui/Avatar';
import { SearchInput } from '@/components/common/SearchInput';

export function Topbar({ title, user, onMenuToggle, notifications = 3 }: {
  title?: string; user?: { name: string; role: string }; onMenuToggle?: () => void; notifications?: number;
}) {
  return (
    <header className="h-14 bg-surface border-b border-line-soft flex items-center px-4 gap-3 flex-shrink-0">
      {onMenuToggle && (
        <button onClick={onMenuToggle} className="text-content-soft hover:text-content-secondary p-1.5 rounded-[8px] hover:bg-accent">
          <Icon.List className="w-5 h-5" />
        </button>
      )}
      {title && <h1 className="text-lg font-semibold text-content">{title}</h1>}
      <div className="flex-1" />
      <button className="relative p-2 text-content-soft hover:text-content-secondary hover:bg-accent rounded-[8px] transition-colors">
        <Icon.Bell className="w-5 h-5" />
        {notifications > 0 && <span className="absolute top-1 right-1 w-2 h-2 bg-danger-solid rounded-full" />}
      </button>
      {user && (
        <div className="flex items-center gap-2.5 ml-1">
          <Avatar name={user.name} size="sm" />
          <div className="hidden sm:block">
            <p className="text-sm font-semibold text-content leading-tight">{user.name}</p>
            <p className="text-2xs text-content-subtle leading-tight">{user.role}</p>
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
    <header className="h-14 bg-surface border-b border-line-soft flex items-center px-4 gap-3 flex-shrink-0 sticky top-0 z-40">
      <div className="flex items-center gap-2.5 w-56 flex-shrink-0">
        <Icon.Logo className="w-7 h-7 flex-shrink-0 text-brand-ink" aria-hidden="true" />
        <span className="text-lg font-bold text-content">PrepExam</span>
      </div>
      <div className="flex-1" />
      <SearchInput className="w-64" placeholder="Search…" />
      <button className="relative p-2 text-content-soft hover:text-content-secondary hover:bg-accent rounded-[8px] transition-colors">
        <Icon.Bell className="w-5 h-5" />
        {notifications > 0 && <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-danger-solid rounded-full" />}
      </button>
      {user && (
        <div className="flex items-center gap-2.5 ml-1 pl-3 border-l border-line-soft">
          <Avatar name={user.name} size="sm" />
          <div className="hidden sm:block">
            <p className="text-sm font-semibold text-content leading-tight">{user.name}</p>
            <p className="text-2xs text-content-subtle leading-tight capitalize">{user.role}</p>
          </div>
          <Icon.ChevronDown className="w-4 h-4 text-content-subtle" />
        </div>
      )}
    </header>
  );
}
