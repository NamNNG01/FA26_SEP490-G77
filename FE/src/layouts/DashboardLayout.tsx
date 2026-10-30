import React from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router';
import { useAuth, landingPathForRole } from '@/auth/authContext';
import { ROUTES, getMenuForRole } from '@/app/routes';
import { Role } from '@/utils/permissions';
import { CourseSearchBar } from '@/features/catalog';
import { Sidebar } from '@/components/layout/Sidebar';
import { UserDropdown } from '@/components/layout/UserDropdown';
import { NotificationBell } from '@/components/layout/NotificationBell';
import { Icon } from '@/assets/icons';

/**
 * DashboardLayout
 *
 * Rendered once by the layout route in AppContent.tsx. It stays mounted
 * while <Outlet /> swaps the page content, so sidebar state (collapse) and
 * scroll position survive navigation.
 *
 * Header layout: [Logo → role dashboard] [course search — STUDENT only] ... [Home · Courses — STUDENT only] [NotificationBell — STUDENT only] [UserDropdown].
 * The user menu (Profile / Theme / Logout) lives in UserDropdown; there is
 * no standalone Logout button anymore.
 */
const STUDENT_HEADER_LINKS = [
  { label: 'Home', to: ROUTES.landing },
  { label: 'Courses', to: ROUTES.courses },
];

export function DashboardLayout() {
  const { user } = useAuth();
  const location = useLocation();
  const [collapsed, setCollapsed] = React.useState(false);
  const items = getMenuForRole(user?.role);

  // Take Exam is a fullscreen flow — hide header/sidebar for it.
  // Exact match only: '/student/exam-rules' and '/student/exam-result'
  // must keep the normal dashboard chrome.
  const isFullscreenPage = location.pathname === '/student/exam';

  if (isFullscreenPage) {
    return <Outlet />;
  }

  return (
    <div className="flex flex-col h-[100dvh] bg-surface-alt overflow-hidden">
      {/* Header */}
      <header className="h-14 bg-surface border-b border-line-soft flex items-center px-[clamp(0.75rem,1.5vw,1.25rem)] gap-3 flex-shrink-0 z-40">
        <div className="flex items-center w-[clamp(11rem,22vw,14rem)] max-w-[30%] flex-shrink-0">
          {/* The logo takes the signed-in user to their role's dashboard. */}
          <Link to={landingPathForRole(user?.role)} aria-label="Go to your dashboard" className="flex items-center gap-2.5">
            <Icon.Logo className="w-7 h-7 flex-shrink-0 text-brand-ink" aria-hidden="true" />
            <span className="text-lg font-bold text-content">PrepExam</span>
          </Link>
        </div>
        {/* Students get the same course search as the public header; it
            falls through to the full catalog (/courses?q=…). */}
        {user?.role === Role.STUDENT ? (
          <div className="flex-1 min-w-0">
            <CourseSearchBar className="max-w-[min(520px,100%)]" />
          </div>
        ) : (
          <div className="flex-1" />
        )}
        {/* Students keep the two site-wide links in the header; their own pages are in the sidebar. */}
        {user?.role === Role.STUDENT && (
          <nav aria-label="Site" className="hidden md:flex items-center gap-1 flex-shrink-0">
            {STUDENT_HEADER_LINKS.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                end={link.to === ROUTES.landing}
                className={({ isActive }) =>
                  `rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                    isActive ? 'bg-primary-light text-brand-ink' : 'text-content-soft hover:bg-surface-hover hover:text-content'
                  }`
                }
              >
                {link.label}
              </NavLink>
            ))}
          </nav>
        )}
        <div className="flex items-center gap-2 ml-1 pl-3 border-l border-line-soft">
          <NotificationBell />
          <UserDropdown />
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar (mounted once; persists across route changes) */}
        {/* No width of its own: it hugs the Sidebar (w-56 / w-16), so the
            panel is exactly as wide as a hovered menu item — no dead space. */}
        <aside className="bg-surface border-r border-line-soft flex flex-col flex-shrink-0 overflow-y-auto overflow-x-hidden">
          <Sidebar
            items={items}
            collapsed={collapsed}
            onToggleCollapse={() => setCollapsed((c) => !c)}
          />
        </aside>

        {/* Main content — swapped by the router, layout stays mounted */}
        <main className="flex-1 overflow-y-auto">
          {/* .dashboard-content owns the page gutter and max width for EVERY
              page, overriding each page's own padding (styles/index.css), so
              all dashboard screens line up on the same edges. */}
          <div className="dashboard-content mx-auto w-full max-w-[1400px] px-[clamp(1rem,2.5vw,2rem)] pb-[clamp(1.5rem,3vw,2.5rem)]">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
