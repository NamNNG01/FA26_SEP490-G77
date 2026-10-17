import React from 'react';
import { useNavigate } from 'react-router';
import { Icon } from '@/assets/icons';

/**
 * CTAButton
 *
 * Reusable call-to-action button for the landing page. Wraps a full-page
 * navigation target (string path) OR a callback (e.g. smooth-scroll to a
 * section) in one consistent, styled control.
 *
 * Labels wrap naturally (`whitespace-normal`, no nowrap) so long text can
 * never be clipped — even at 360px small-mobile widths.
 *
 * variant:
 *  - primary   → solid brand jade (main user journey)
 *  - secondary → white/outline (additional information)
 * size:
 *  - md for in-card CTAs, lg for hero / final CTA.
 */
export interface CTAButtonProps {
  label: string;
  /** Route path to navigate to. Takes precedence over onClick. */
  to?: string;
  /** Alternative action (e.g. scroll to a section id). */
  onClick?: () => void;
  variant?: 'primary' | 'secondary';
  size?: 'md' | 'lg';
  /** Show a trailing arrow icon (primary CTAs). */
  withArrow?: boolean;
  className?: string;
}

const sizeClasses = {
  md: 'h-10 px-5 text-base',
  lg: 'h-12 px-6 sm:px-7 text-lg',
};

export function CTAButton({
  label,
  to,
  onClick,
  variant = 'primary',
  size = 'lg',
  withArrow = false,
  className = '',
}: CTAButtonProps) {
  const navigate = useNavigate();

  function handleActivate() {
    if (to) navigate(to);
    else onClick?.();
  }

  const isPrimary = variant === 'primary';

  return (
    <button
      type="button"
      onClick={handleActivate}
      className={`group inline-flex items-center justify-center gap-2 font-semibold rounded-[10px] transition-colors duration-200 cursor-pointer select-none
        active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600/40 focus-visible:ring-offset-2
        ${
          isPrimary
            ? 'bg-brand-600 text-white hover:bg-brand-700'
            : 'bg-surface text-content-secondary border border-line shadow-sm hover:bg-surface-hover hover:border-line-strong'
        }
        ${sizeClasses[size]} ${className}`}
    >
      <span className="whitespace-normal text-center leading-tight">{label}</span>
      {withArrow && (
        <Icon.ChevronRight className="w-4 h-4 flex-shrink-0 transition-transform duration-200 group-hover:translate-x-0.5" />
      )}
    </button>
  );
}
