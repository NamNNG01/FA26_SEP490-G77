import React, { useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { Icon } from '@/assets/icons';
import { ROUTES } from '@/app/routes';
import { useAuth, landingPathForRole } from '@/auth/authContext';
import { CourseSearchBar } from '@/features/catalog';
import { Container } from './Container';

/**
 * PublicNavbar
 *
 * Sticky header for every guest-facing page (landing, /courses, course detail,
 * pricing). Layout, left to right:
 *
 *   [PrepExam] [ Search courses… ] [ Home · Courses · Pricing ] [ Login | Get Started ]
 *
 * The search bar is deliberately given the flexible middle column so it takes
 * more width than the navigation items — it is the primary way into the
 * catalog. Signed-in visitors get a Dashboard action instead of Login /
 * Get Started, but keep the same search.
 *
 * Responsive: below `lg` the inline search collapses and a full-width search
 * moves into the hamburger menu, so the bar never squeezes the nav items.
 */
export function PublicNavbar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated, user } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  const dashboardPath = landingPathForRole(user?.role?.code);

  const navLinks = [
    { label: 'Home', to: ROUTES.landing },
    { label: 'Courses', to: ROUTES.courses },
    { label: 'Pricing', to: ROUTES.pricing },
  ];

  function goTo(path: string) {
    setMenuOpen(false);
    navigate(path);
  }

  function isActive(path: string) {
    if (path === ROUTES.landing) return location.pathname === ROUTES.landing;
    return location.pathname === path || location.pathname.startsWith(`${path}/`);
  }

  return (
    <header className="sticky top-0 z-50 border-b border-[#F3F4F6] bg-white/85 backdrop-blur-md dark:border-[#1F2937] dark:bg-[#111827]/85">
      <Container className="!px-[clamp(16px,4vw,40px)]">
        <div className="flex h-16 min-w-0 items-center gap-3 lg:gap-5">
          {/* Logo */}
          <button
            type="button"
            onClick={() => goTo(ROUTES.landing)}
            aria-label="PrepExam home"
            className="flex flex-shrink-0 cursor-pointer items-center gap-2.5"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-[8px] bg-[#2563EB] shadow-sm">
              <Icon.Brain className="h-4.5 w-4.5 text-white" />
            </span>
            <span className="text-[16px] font-bold text-[#111827] dark:text-[#F9FAFB]">PrepExam</span>
          </button>

          {/* Course search — the widest element in the bar */}
          <CourseSearchBar className="hidden min-w-0 flex-1 lg:block lg:max-w-[min(520px,42vw)]" />

          {/* Desktop nav */}
          <nav className="ml-auto hidden items-center gap-1 lg:flex">
            {navLinks.map((link) => (
              <button
                key={link.to}
                type="button"
                onClick={() => goTo(link.to)}
                aria-current={isActive(link.to) ? 'page' : undefined}
                className={`rounded-[10px] px-3 py-2 text-[14px] font-medium transition-colors cursor-pointer ${
                  isActive(link.to)
                    ? 'bg-[#EFF6FF] text-[#2563EB] dark:bg-[#2563EB]/15 dark:text-[#93C5FD]'
                    : 'text-[#4B5563] hover:bg-[#F3F4F6] hover:text-[#111827] dark:text-[#D1D5DB] dark:hover:bg-[#26324A] dark:hover:text-white'
                }`}
              >
                {link.label}
              </button>
            ))}
          </nav>

          {/* Desktop auth actions */}
          <div className="hidden flex-shrink-0 items-center gap-2 lg:flex">
            {isAuthenticated ? (
              <button
                type="button"
                onClick={() => goTo(dashboardPath)}
                className="inline-flex h-9 items-center gap-1.5 rounded-[10px] bg-[#2563EB] px-4 text-[14px] font-semibold text-white shadow-sm transition-colors hover:bg-[#1D4ED8] cursor-pointer"
              >
                Dashboard
                <Icon.ChevronRight className="h-4 w-4" />
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => goTo(ROUTES.login)}
                  className="h-9 rounded-[10px] px-3 text-[14px] font-semibold text-[#4B5563] transition-colors hover:bg-[#F3F4F6] hover:text-[#111827] dark:text-[#D1D5DB] dark:hover:bg-[#26324A] dark:hover:text-white cursor-pointer"
                >
                  Login
                </button>
                <button
                  type="button"
                  onClick={() => goTo(ROUTES.register)}
                  className="inline-flex h-9 items-center rounded-[10px] bg-[#2563EB] px-4 text-[14px] font-semibold text-white shadow-sm transition-colors hover:bg-[#1D4ED8] cursor-pointer"
                >
                  Get Started
                </button>
              </>
            )}
          </div>

          {/* Mobile hamburger */}
          <button
            type="button"
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((o) => !o)}
            className="ml-auto inline-flex h-10 w-10 items-center justify-center rounded-[10px] text-[#374151] transition-colors hover:bg-[#F3F4F6] lg:hidden dark:text-[#F9FAFB] dark:hover:bg-[#26324A] cursor-pointer"
          >
            {menuOpen ? <Icon.X className="h-5 w-5" /> : <Icon.List className="h-5 w-5" />}
          </button>
        </div>
      </Container>

      {/* Mobile menu — search, nav links and auth actions, full width inside the container */}
      {menuOpen && (
        <div className="border-t border-[#F3F4F6] pb-4 lg:hidden dark:border-[#1F2937]">
          <Container className="!px-[clamp(16px,4vw,40px)]">
            <div className="pt-3">
              <CourseSearchBar onNavigate={() => setMenuOpen(false)} />

              <nav className="mt-3 flex flex-col gap-1 border-t border-[#F3F4F6] pt-3 dark:border-[#1F2937]">
                {navLinks.map((link) => (
                  <button
                    key={link.to}
                    type="button"
                    onClick={() => goTo(link.to)}
                    className={`rounded-[10px] px-3 py-2.5 text-left text-[14px] font-medium transition-colors cursor-pointer ${
                      isActive(link.to)
                        ? 'bg-[#EFF6FF] text-[#2563EB] dark:bg-[#2563EB]/15 dark:text-[#93C5FD]'
                        : 'text-[#4B5563] hover:bg-[#F3F4F6] dark:text-[#D1D5DB] dark:hover:bg-[#26324A]'
                    }`}
                  >
                    {link.label}
                  </button>
                ))}
              </nav>

              {isAuthenticated ? (
                <button
                  type="button"
                  onClick={() => goTo(dashboardPath)}
                  className="mt-3 inline-flex h-10 w-full items-center justify-center rounded-[10px] bg-[#2563EB] text-[14px] font-semibold text-white shadow-sm transition-colors hover:bg-[#1D4ED8] cursor-pointer"
                >
                  Dashboard
                </button>
              ) : (
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => goTo(ROUTES.login)}
                    className="inline-flex h-10 items-center justify-center rounded-[10px] border border-[#E5E7EB] text-[14px] font-semibold text-[#374151] transition-colors hover:bg-[#F9FAFB] dark:border-[#1F2937] dark:text-[#D1D5DB] dark:hover:bg-[#26324A] cursor-pointer"
                  >
                    Login
                  </button>
                  <button
                    type="button"
                    onClick={() => goTo(ROUTES.register)}
                    className="inline-flex h-10 items-center justify-center rounded-[10px] bg-[#2563EB] text-[14px] font-semibold text-white shadow-sm transition-colors hover:bg-[#1D4ED8] cursor-pointer"
                  >
                    Get Started
                  </button>
                </div>
              )}
            </div>
          </Container>
        </div>
      )}
    </header>
  );
}