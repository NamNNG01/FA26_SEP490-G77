import React from 'react';

/**
 * Container
 *
 * The single fluid width-container for every public page section.
 * Zoom-safe and viewport-fluid (no fixed widths):
 *
 *   width          : min(100%, 1400px) → expands with the viewport, capped for 4K
 *   padding-inline : clamp(16px, 4vw, 48px) → fluid, never clips content
 *   margin-inline  : auto → centered on wide screens
 */
export function Container({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`w-[min(100%,1400px)] mx-auto px-[clamp(16px,4vw,48px)] ${className}`}
    >
      {children}
    </div>
  );
}
