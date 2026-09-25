import React, { useState } from 'react';
import { useNavigate } from 'react-router';
import { Icon } from '@/assets/icons';
import { ROUTES } from '@/app/routes';
import { Container } from './Container';

/**
 * PublicNavbar
 *
 * Top navigation for public pages:
 *  - Desktop: logo left, nav center/right, CTA right
 *  - Mobile: collapses into a hamburger menu; the dropdown is full-width
 *    inside the Container so navigation can never push off-screen.
 *
 * "Get Started" follows the same auth-aware primary-CTA rule as the hero
 * (dashboard for logged-in users, registration for guests) via primaryPath.
 */
export function PublicNavbar({ primaryPath }: { primaryPath: string }) {
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  const navLinks = [
    { label: 'Home', to: ROUTES.landing },
    { label: 'Exams', to: ROUTES.examsIntro },
    { label: 'Pricing', to: ROUTES.pricing },
  ];

  function goTo(path: string) {
    setMenuOpen(false);
    navigate(path);
  }

  return (
    <header className="sticky top-0 z-50 bg-white/80 dark:bg-[#111827]/80 backdrop-blur-md border-b border-[#F3F4F6] dark:border-[#1F2937]">
      <Container className="!px-[clamp(16px,4vw,40px)]">
        <div className="h-16 flex items-center justify-between gap-4 min-w-0">
          {/* Logo */}
          <button
            type="button"
            onClick={() => goTo(ROUTES.landing)}
            className="flex items-center gap-2.5 cursor-pointer flex-shrink-0"
          >
            <div className="w-8 h-8 bg-[#2563EB] rounded-[8px] flex items-center justify-center shadow-sm">
              <Icon.Brain className="w-4.5 h-4.5 text-white" />
            </div>
            <span className="text-[16px] font-bold text-[#111827] dark:text-[#F9FAFB]">
              CertifyAI
            </span>
          </button>

          {/* Desktop nav — center/right */}
          <nav className="hidden md:flex items-center gap-1 ml-auto mr-2">
            {navLinks.map((link) => (
              <button
                key={link.to}
                type="button"
                onClick={() => goTo(link.to)}
                className="px-3 py-2 rounded-[10px] text-[14px] font-medium text-[#4B5563] dark:text-[#D1D5DB] hover:text-[#111827] dark:hover:text-white hover:bg-[#F3F4F6] dark:hover:bg-[#26324A] transition-colors cursor-pointer"
              >
                {link.label}
              </button>
            ))}
          </nav>

          {/* Desktop CTA */}
          <button
            type="button"
            onClick={() => goTo(primaryPath)}
            className="hidden md:inline-flex h-9 px-4 items-center text-[14px] font-semibold bg-[#2563EB] text-white rounded-[10px] shadow-sm hover:bg-[#1D4ED8] transition-colors cursor-pointer"
          >
            Get Started
          </button>

          {/* Mobile hamburger */}
          <button
            type="button"
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((o) => !o)}
            className="md:hidden w-10 h-10 rounded-[10px] inline-flex items-center justify-center text-[#374151] dark:text-[#F9FAFB] hover:bg-[#F3F4F6] dark:hover:bg-[#26324A] transition-colors cursor-pointer"
          >
            {menuOpen ? <Icon.X className="w-5 h-5" /> : <Icon.List className="w-5 h-5" />}
          </button>
        </div>

        {/* Mobile menu — full width inside the container, never off-screen */}
        {menuOpen && (
          <nav className="md:hidden pb-4 flex flex-col gap-1 border-t border-[#F3F4F6] dark:border-[#1F2937] pt-3">
            {navLinks.map((link) => (
              <button
                key={link.to}
                type="button"
                onClick={() => goTo(link.to)}
                className="w-full text-left px-3 py-2.5 rounded-[10px] text-[14px] font-medium text-[#4B5563] dark:text-[#D1D5DB] hover:bg-[#F3F4F6] dark:hover:bg-[#26324A] transition-colors cursor-pointer"
              >
                {link.label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => goTo(primaryPath)}
              className="mt-2 h-10 w-full inline-flex items-center justify-center text-[14px] font-semibold bg-[#2563EB] text-white rounded-[10px] shadow-sm hover:bg-[#1D4ED8] transition-colors cursor-pointer"
            >
              Get Started
            </button>
          </nav>
        )}
      </Container>
    </header>
  );
}
