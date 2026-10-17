import React from 'react';
import { useNavigate } from 'react-router';
import { Icon } from '@/assets/icons';
import { ROUTES } from '@/app/routes';

/**
 * PlaceholderPage
 *
 * Shared shell for the public placeholder pages (/pricing, /exams): a
 * lightweight "coming soon" screen so header/footer CTAs resolve for guests.
 * The real pages will replace these.
 *
 * Height is `100dvh - 4rem` (minus the 64px public header) because this page
 * renders inside PublicLayout, which supplies the header and footer.
 */
export function PlaceholderPage({ title, subtitle }: { title: string; subtitle: string }) {
  const navigate = useNavigate();

  return (
    <div className="flex min-h-[calc(100dvh-4rem)] items-center justify-center bg-gradient-to-br from-surface-brand to-surface p-4 sm:p-6">
      <div className="max-w-md w-full text-center">
        <button
          type="button"
          onClick={() => navigate(ROUTES.landing)}
          className="inline-flex items-center gap-2 h-9 px-4 rounded-[10px] text-base font-medium text-content-secondary bg-surface border border-line hover:bg-surface-hover transition-colors cursor-pointer"
        >
          <Icon.ChevronLeft className="w-4 h-4" />
          Back to Home
        </button>

        <div className="card p-10 mt-6 shadow-lg">
          <div className="w-14 h-14 rounded-[14px] bg-primary-light flex items-center justify-center mx-auto">
            <Icon.Zap className="w-7 h-7 text-brand-ink" />
          </div>
          <h1 className="text-xl font-bold text-content mt-5">
            {title}
          </h1>
          <p className="text-base text-content-soft leading-relaxed mt-2">
            {subtitle}
          </p>
          <button
            type="button"
            onClick={() => navigate(ROUTES.register)}
            className="mt-6 h-10 px-5 inline-flex items-center text-base font-semibold bg-brand-600 text-white rounded-[10px] shadow-sm hover:bg-brand-700 transition-colors cursor-pointer"
          >
            Create Free Account
          </button>
        </div>
      </div>
    </div>
  );
}
