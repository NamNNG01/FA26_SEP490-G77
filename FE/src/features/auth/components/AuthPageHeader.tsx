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
 *   [Logo] PrepExam       (clickable → landing page)
 *   Title
 *   Subtitle
 *
 * Pass `icon` (password recovery screens) to show a feature icon tile in
 * place of the logo + wordmark:
 *
 *   [Icon]
 *   Title
 *   Subtitle
 *
 * Fluid typography: the title scales clamp(1.75rem → 2.5rem) with viewport
 * width, and spacing compresses on short viewports (<850px height) so the
 * whole page still fits without scrolling on desktop/laptop — the height
 * media-query variants below keep the no-scrollbar guarantee from the
 * height-responsive layout work while staying fluid at every zoom level.
 */
export function AuthPageHeader({
  title,
  subtitle,
  icon,
}: {
  title: string;
  subtitle: string;
  icon?: React.ReactNode;
}) {
  const navigate = useNavigate();

  return (
    <header className="shrink-0">
      {/* Back to Home — full width on mobile, inline top-left from sm up.
          Hover: text turns primary blue, arrow shifts left 4px (200ms). */}
      <button
        type="button"
        aria-label="Back to Landing Page"
        onClick={() => navigate(ROUTES.landing)}
        className="group w-full sm:w-auto inline-flex items-center justify-center sm:justify-start gap-1.5 text-[clamp(0.8125rem,0.78rem+0.2vw,0.875rem)] font-medium text-content-soft hover:text-brand-ink transition-colors duration-200 cursor-pointer"
      >
        <Icon.ChevronLeft className="w-4 h-4 transition-transform duration-200 group-hover:-translate-x-1" />
        Back to Home
      </button>

      {/* Logo + wordmark — centered, click returns to the landing page.
          Hover: opacity 0.9 (200ms). */}
      <div className="text-center mt-4">
        {icon ? (
          <span
            aria-hidden="true"
            className="w-14 h-14 mx-auto rounded-[16px] border border-brand-line bg-primary-light text-brand-ink flex items-center justify-center shadow-sm [@media(max-height:850px)]:w-12 [@media(max-height:850px)]:h-12"
          >
            {icon}
          </span>
        ) : (
          <button
            type="button"
            aria-label="Go to Home"
            onClick={() => navigate(ROUTES.landing)}
            className="inline-flex items-center gap-2.5 hover:opacity-90 transition-opacity duration-200 cursor-pointer"
          >
            <Icon.Logo className="w-12 h-12 flex-shrink-0 text-brand-ink" aria-hidden="true" />
            <span className="text-[1rem] font-bold text-content">PrepExam</span>
          </button>
        )}

        {/* Fluid title — 28px on small screens up to 40px on wide ones;
            tightens on short viewports so nothing scrolls on laptops. */}
        <h1 className="text-[clamp(1.75rem,1.3rem+1.6vw,2.5rem)] leading-[1.15] font-bold text-content mt-5 [@media(max-height:850px)]:text-[clamp(1.625rem,1.25rem+1.2vw,2rem)] [@media(max-height:850px)]:mt-4">
          {title}
        </h1>
        <p className="text-[clamp(0.8125rem,0.78rem+0.2vw,0.875rem)] text-content-soft mt-2.5 [@media(max-height:850px)]:mt-2">
          {subtitle}
        </p>
      </div>
      {/* Space to the form card below is AuthLayout's fluid flex gap — no
          fixed large margins anywhere. */}
    </header>
  );
}
