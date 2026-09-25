import React from 'react';
import { Outlet, useLocation } from 'react-router';
import { useAuth } from '@/auth/authContext';
import { getMenuForRole } from '@/app/routes';
import { Sidebar } from '@/components/layout/Sidebar';
import { UserDropdown } from '@/components/layout/UserDropdown';
import { Icon } from '@/assets/icons';

/**
 * DashboardLayout
 *
 * Rendered once by the layout route in AppContent.tsx. It stays mounted
 * while <Outlet /> swaps the page content, so sidebar state (collapse) and
 * scroll position survive navigation.
 *
 * Header layout: [Logo] ...... [notifications bell] [UserDropdown].
 * The user menu (Profile / Theme / Logout) lives in UserDropdown; there is
 * no standalone Logout button anymore.
 */
export function DashboardLayout() {
  const { user } = useAuth();
  const location = useLocation();
  const [collapsed, setCollapsed] = React.useState(false);
  const items = getMenuForRole(user?.role?.code);

  // Take Exam is a fullscreen flow — hide header/sidebar for it.
  // Exact match only: '/student/exam-rules' and '/student/exam-result'
  // must keep the normal dashboard chrome.
  const isFullscreenPage = location.pathname === '/student/exam';

  if (isFullscreenPage) {
    return <Outlet />;
  }

  return (
    <div className="flex flex-col h-[100dvh] bg-[#F9FAFB] overflow-hidden">
      {/* Header */}
      <header className="h-14 bg-white border-b border-[#F3F4F6] flex items-center px-[clamp(0.75rem,1.5vw,1.25rem)] gap-3 flex-shrink-0 z-40">
        <div className="flex items-center gap-2.5 w-[clamp(11rem,22vw,14rem)] max-w-[30%] flex-shrink-0">
          <div className="w-7 h-7 bg-[#2563EB] rounded-[8px] flex items-center justify-center">
            <Icon.Brain className="w-4 h-4 text-white" />
          </div>
          <span className="text-[15px] font-bold text-[#111827]">CertifyAI</span>
        </div>
        <div className="flex-1" />
        <div className="flex items-center gap-2 ml-1 pl-3 border-l border-[#F3F4F6]">
          <UserDropdown />
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar (mounted once; persists across route changes) */}
        <aside
          className={`bg-white border-r border-[#F3F4F6] flex flex-col flex-shrink-0 overflow-y-auto transition-all duration-200 ${
            collapsed ? 'w-[clamp(3.5rem,4vw,4rem)]' : 'w-[clamp(13.75rem,18vw,17.5rem)]'
          }`}
        >
          <Sidebar
            items={items}
            collapsed={collapsed}
            onToggleCollapse={() => setCollapsed((c) => !c)}
          />
        </aside>

        {/* Main content — swapped by the router, layout stays mounted */}
        <main className="flex-1 overflow-y-auto">
          <div className="p-[clamp(1rem,2vw,1.5rem)]">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
