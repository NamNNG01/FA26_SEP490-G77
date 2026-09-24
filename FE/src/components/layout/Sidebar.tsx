import React from 'react';
import { NavLink } from 'react-router';
import { Icon } from '@/assets/icons';
import type { MenuItem } from '@/app/routes';

/**
 * Sidebar
 *
 * SINGLE sidebar component for every role. It renders exactly the flat
 * menu list passed by DashboardLayout (menuByRole[user.role.code]) — no
 * section headers, no role branching inside this component.
 *
 * - NavLink → the active item is derived from the current URL
 *   (e.g. /admin/users highlights "User Management").
 * - Collapsed: icons only, with tooltips; Expanded: icon + text.
 * - Transition/animation unchanged (w-16/w-56, duration-200).
 */
export function Sidebar({
  items,
  collapsed = false,
  onToggleCollapse,
}: {
  items: MenuItem[];
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}) {
  return (
    <div
      className={`flex flex-col h-full transition-all duration-200 ${
        collapsed ? 'w-16' : 'w-56'
      }`}
    >
      {/* Collapse toggle */}
      {onToggleCollapse && (
        <button
          type="button"
          onClick={onToggleCollapse}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className="sidebar-link w-full mb-2 justify-center cursor-pointer"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? (
            <Icon.ChevronRight className="w-4 h-4" />
          ) : (
            <>
              <Icon.ChevronLeft className="w-4 h-4" />
              <span className="flex-1 text-left">Collapse</span>
            </>
          )}
        </button>
      )}

      <nav className="flex-1 overflow-y-auto">
        {items.map((item) => (
          <NavLink
            key={item.id}
            to={item.path}
            title={collapsed ? item.title : undefined}
            className={({ isActive }) =>
              `sidebar-link w-full ${isActive ? 'active' : ''} ${
                collapsed ? 'justify-center px-0' : ''
              }`
            }
          >
            <span className="w-4 h-4 flex-shrink-0">{item.icon}</span>
            {!collapsed && <span className="flex-1">{item.title}</span>}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
