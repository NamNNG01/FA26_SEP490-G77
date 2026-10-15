import React from 'react';
import type { CourseProviderId } from '../types';

/**
 * ProviderLogo
 *
 * Inline SVG wordmark tile for a certification provider. No icon library and
 * no network requests — each mark is a small hand-rolled SVG drawn in a
 * 40×40 viewBox and scaled by `size`.
 *
 * Background colors are applied inline (not via Tailwind color classes) so the
 * dark-mode utility remaps in styles/index.css never recolor a brand tile.
 */
export function ProviderLogo({
  providerId,
  provider,
  size = 40,
  className = '',
}: {
  providerId: CourseProviderId;
  provider: string;
  size?: number;
  className?: string;
}) {
  const mark = MARKS[providerId];

  return (
    <span
      aria-hidden
      title={provider}
      style={{ width: size, height: size, background: mark.background }}
      className={`inline-flex flex-shrink-0 items-center justify-center overflow-hidden rounded-[10px] shadow-sm ${className}`}
    >
      <svg viewBox="0 0 40 40" width={size} height={size} focusable="false">
        {mark.content}
      </svg>
    </span>
  );
}

const MARKS: Record<CourseProviderId, { background: string; content: React.ReactNode }> = {
  // AWS — squid-ink tile with the "aws" wordmark and its orange smile arrow.
  aws: {
    background: '#232F3E',
    content: (
      <>
        <text
          x="20"
          y="23"
          textAnchor="middle"
          fontSize="12.5"
          fontWeight={800}
          letterSpacing="-0.4"
          fill="#FFFFFF"
        >
          aws
        </text>
        <path
          d="M11 26.5c3.2 2 7.6 2.9 11.6 2.3 3.1-.5 5.9-1.9 7.9-3.6-1.4 2.9-5.1 5.1-10 5.3-3.6.2-6.7-1.2-9.5-4z"
          fill="#FF9900"
        />
        <path d="M30.6 24.6l1.9.5-.4-1.9z" fill="#FF9900" />
      </>
    ),
  },
  // Microsoft — four-tile mark.
  microsoft: {
    background: '#F25022',
    content: (
      <>
        <rect x="9" y="9" width="10" height="10" fill="#FFFFFF" />
        <rect x="21" y="9" width="10" height="10" fill="#FFFFFF" />
        <rect x="9" y="21" width="10" height="10" fill="#FFFFFF" />
        <rect x="21" y="21" width="10" height="10" fill="#F25022" stroke="#FFFFFF" strokeWidth="1.2" />
      </>
    ),
  },
  // Google Cloud — blue tile with a cloud glyph.
  'google-cloud': {
    background: '#1A73E8',
    content: (
      <>
        <path
          d="M14 29a7 7 0 0 1-.6-13.96 9 9 0 0 1 17.2 2.2A6.4 6.4 0 0 1 30 29.4H14z"
          fill="#FFFFFF"
        />
        <path d="M12 25.5h18" stroke="#1A73E8" strokeWidth="1.4" strokeLinecap="round" />
      </>
    ),
  },
  // CompTIA — red tile with the "C+" monogram.
  comptia: {
    background: '#C8102E',
    content: (
      <text x="20" y="26" textAnchor="middle" fontSize="16" fontWeight={800} fill="#FFFFFF">
        C+
      </text>
    ),
  },
  // Cisco — blue tile with the bridge bars over the lowercase wordmark.
  cisco: {
    background: '#049FD9',
    content: (
      <>
        <g fill="#FFFFFF">
          <rect x="12.5" y="10" width="2.6" height="8" />
          <rect x="18.7" y="10" width="2.6" height="8" />
          <rect x="24.9" y="10" width="2.6" height="8" />
        </g>
        <rect x="10" y="20.5" width="20" height="2.6" fill="#FFFFFF" />
        <text x="20" y="33" textAnchor="middle" fontSize="9" fontWeight={700} letterSpacing="0.4" fill="#FFFFFF">
          cisco
        </text>
      </>
    ),
  },
};