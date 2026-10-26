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

  const dashboardPath = landingPathForRole(user?.role);

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
    <header className="sticky top-0 z-50 border-b border-line-soft bg-surface/85 backdrop-blur-md">
      <Container className="!px-[clamp(16px,4vw,40px)]">
        <div className="flex h-16 min-w-0 items-center gap-3 lg:gap-5">
          {/* Logo */}
          {/* Signed in → the role's own dashboard; guests → the landing page. */}
          <button
            type="button"
            onClick={() => goTo(isAuthenticated ? dashboardPath : ROUTES.landing)}
            aria-label={isAuthenticated ? 'Go to your dashboard' : 'PrepExam home'}
            className="flex flex-shrink-0 cursor-pointer items-center gap-2.5"
          >
            <Icon.Logo className="h-8 w-8 flex-shrink-0 text-brand-ink" aria-hidden="true" />
            <span className="text-lg font-bold text-content">PrepExam</span>
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
                className={`rounded-[10px] px-3 py-2 text-base font-medium transition-colors cursor-pointer ${
                  isActive(link.to)
                    ? 'bg-primary-light text-brand-ink'
                    : 'text-content-muted hover:bg-accent hover:text-content'
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
                className="inline-flex h-9 items-center gap-1.5 rounded-[10px] bg-brand-600 px-4 text-base font-semibold text-white shadow-sm transition-colors hover:bg-brand-700 cursor-pointer"
              >
                Dashboard
                <Icon.ChevronRight className="h-4 w-4" />
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => goTo(ROUTES.login)}
                  className="h-9 rounded-[10px] px-3 text-base font-semibold text-content-muted transition-colors hover:bg-accent hover:text-content cursor-pointer"
                >
                  Login
                </button>
                <button
                  type="button"
                  onClick={() => goTo(ROUTES.register)}
                  className="inline-flex h-9 items-center rounded-[10px] bg-brand-600 px-4 text-base font-semibold text-white shadow-sm transition-colors hover:bg-brand-700 cursor-pointer"
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
            className="ml-auto inline-flex h-10 w-10 items-center justify-center rounded-[10px] text-content-secondary transition-colors hover:bg-accent lg:hidden cursor-pointer"
          >
            {menuOpen ? <Icon.X className="h-5 w-5" /> : <Icon.List className="h-5 w-5" />}
          </button>
        </div>
      </Container>

      {/* Mobile menu — search, nav links and auth actions, full width inside the container */}
      {menuOpen && (
        <div className="border-t border-line-soft pb-4 lg:hidden">
          <Container className="!px-[clamp(16px,4vw,40px)]">
            <div className="pt-3">
              <CourseSearchBar onNavigate={() => setMenuOpen(false)} />

              <nav className="mt-3 flex flex-col gap-1 border-t border-line-soft pt-3">
                {navLinks.map((link) => (
                  <button
                    key={link.to}
                    type="button"
                    onClick={() => goTo(link.to)}
                    className={`rounded-[10px] px-3 py-2.5 text-left text-base font-medium transition-colors cursor-pointer ${
                      isActive(link.to)
                        ? 'bg-primary-light text-brand-ink'
                        : 'text-content-muted hover:bg-accent'
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
                  className="mt-3 inline-flex h-10 w-full items-center justify-center rounded-[10px] bg-brand-600 text-base font-semibold text-white shadow-sm transition-colors hover:bg-brand-700 cursor-pointer"
                >
                  Dashboard
                </button>
              ) : (
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => goTo(ROUTES.login)}
                    className="inline-flex h-10 items-center justify-center rounded-[10px] border border-line text-base font-semibold text-content-secondary transition-colors hover:bg-surface-hover cursor-pointer"
                  >
                    Login
                  </button>
                  <button
                    type="button"
                    onClick={() => goTo(ROUTES.register)}
                    className="inline-flex h-10 items-center justify-center rounded-[10px] bg-brand-600 text-base font-semibold text-white shadow-sm transition-colors hover:bg-brand-700 cursor-pointer"
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