import React from 'react';
import { useNavigate } from 'react-router';
import { Icon } from '@/assets/icons';
import { ROUTES } from '@/app/routes';

/**
 * AuthPageHeader
 *
 * Shared header for the Login / Register pages:
 *
 *   ← Back to Home        (top-left on ≥sm; full-width above the form on mobile)
 *   [Logo] CertifyAI      (clickable → landing page)
 *   Title
 *   Subtitle
 *
 * Fluid typography: the title scales clamp(1.75rem → 2.5rem) with viewport
 * width, and spacing compresses on short viewports (<850px height) so the
 * whole page still fits without scrolling on desktop/laptop — the height
 * media-query variants below keep the no-scrollbar guarantee from the
 * height-responsive layout work while staying fluid at every zoom level.
 */
export function AuthPageHeader({ title, subtitle }: { title: string; subtitle: string }) {
  const navigate = useNavigate();

  return (
    <header className="shrink-0">
      {/* Back to Home — full width on mobile, inline top-left from sm up.
          Hover: text turns primary blue, arrow shifts left 4px (200ms). */}
      <button
        type="button"
        aria-label="Back to Landing Page"
        onClick={() => navigate(ROUTES.landing)}
        className="group w-full sm:w-auto inline-flex items-center justify-center sm:justify-start gap-1.5 text-[clamp(0.8125rem,0.78rem+0.2vw,0.875rem)] font-medium text-[#6B7280] hover:text-[#2563EB] transition-colors duration-200 cursor-pointer"
      >
        <Icon.ChevronLeft className="w-4 h-4 transition-transform duration-200 group-hover:-translate-x-1" />
        Back to Home
      </button>

      {/* Logo + wordmark — centered, click returns to the landing page.
          Hover: opacity 0.9 (200ms). */}
      <div className="text-center mt-4">
        <button
          type="button"
          aria-label="Go to Home"
          onClick={() => navigate(ROUTES.landing)}
          className="inline-flex items-center gap-2.5 hover:opacity-90 transition-opacity duration-200 cursor-pointer"
        >
          <span className="w-12 h-12 bg-[#2563EB] rounded-[14px] flex items-center justify-center shadow-md">
            <Icon.Brain className="w-7 h-7 text-white" />
          </span>
          <span className="text-[1rem] font-bold text-[#111827]">CertifyAI</span>
        </button>

        {/* Fluid title — 28px on small screens up to 40px on wide ones;
            tightens on short viewports so nothing scrolls on laptops. */}
        <h1 className="text-[clamp(1.75rem,1.3rem+1.6vw,2.5rem)] leading-[1.15] font-bold text-[#111827] mt-5 [@media(max-height:850px)]:text-[clamp(1.625rem,1.25rem+1.2vw,2rem)] [@media(max-height:850px)]:mt-4">
          {title}
        </h1>
        <p className="text-[clamp(0.8125rem,0.78rem+0.2vw,0.875rem)] text-[#6B7280] mt-2.5 [@media(max-height:850px)]:mt-2">
          {subtitle}
        </p>
      </div>
      {/* Space to the form card below is AuthLayout's fluid flex gap — no
          fixed large margins anywhere. */}
    </header>
  );
}
