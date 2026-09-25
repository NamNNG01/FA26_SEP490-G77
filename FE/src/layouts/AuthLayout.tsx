import React from 'react';

/**
 * AuthLayout
 *
 * THE single authentication layout — rendered once by AppContent around
 * all unauthenticated auth-form routes. Pages must NOT wrap themselves in
 * another AuthLayout.
 *
 * Fluid, height-responsive (100dvh — never 100vh):
 *  - `height: 100dvh` + flex + `m-auto` centers the form column with no
 *    fixed margins; the column is `width: min(100%, 430px)`.
 *  - Desktop/laptop (viewport height ≥760px): `overflow: hidden` — the
 *    compact fluid content always fits, so NO scrollbar appears at
 *    1920×1080, 1600×900, 1536×864, 1440×900, 1366×768, 1280×720 — at any
 *    zoom level the fluid clamp() sizing keeps the total height bounded.
 *  - Below 760px viewport height (tablet portrait / mobile): scrolling
 *    unlocks via the height media query, so nothing is ever clipped.
 *  - Gaps compress below 850px viewport height (short laptops).
 */
export function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-[100dvh] overflow-hidden [@media(max-height:760px)]:overflow-y-auto bg-gradient-to-br from-[#EFF6FF] to-white dark:from-[#0B1220] dark:to-[#111827] flex flex-col px-4 py-5 sm:px-6">
      <div className="m-auto w-[min(100%,430px)] flex flex-col gap-4 sm:gap-5 [@media(max-height:850px)]:gap-3.5">
        {children}
      </div>
    </div>
  );
}
