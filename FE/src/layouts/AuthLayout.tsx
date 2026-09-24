import React from 'react';

/**
 * AuthLayout
 *
 * THE single authentication layout — rendered once by AppContent around
 * all unauthenticated routes. Pages must NOT wrap themselves in another
 * AuthLayout (no nesting — one background, one centered column).
 *
 * - Full-screen gradient background (light + dark theme aware).
 * - Centered card column, width 420-460px, responsive padding.
 * - No header, no sidebar, no hero, no overlays.
 */
export function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-[#EFF6FF] to-white dark:from-[#0B1220] dark:to-[#111827] flex items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-[460px] sm:max-w-[420px] flex-shrink-0">
        {children}
      </div>
    </div>
  );
}
