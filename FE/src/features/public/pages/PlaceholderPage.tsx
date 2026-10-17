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
    <div className="flex min-h-[calc(100dvh-4rem)] items-center justify-center bg-gradient-to-br from-[#ECF7F4] to-white p-4 sm:p-6 dark:from-[#0B1220] dark:to-[#111827]">
      <div className="max-w-md w-full text-center">
        <button
          type="button"
          onClick={() => navigate(ROUTES.landing)}
          className="inline-flex items-center gap-2 h-9 px-4 rounded-[10px] text-[14px] font-medium text-[#374151] dark:text-[#D1D5DB] bg-white dark:bg-[#111827] border border-[#E5E7EB] dark:border-[#1F2937] hover:bg-[#F9FAFB] dark:hover:bg-[#26324A] transition-colors cursor-pointer"
        >
          <Icon.ChevronLeft className="w-4 h-4" />
          Back to Home
        </button>

        <div className="card p-10 mt-6 shadow-lg">
          <div className="w-14 h-14 rounded-[14px] bg-[#ECF7F4] dark:bg-[#0D7C6C]/15 flex items-center justify-center mx-auto">
            <Icon.Zap className="w-7 h-7 text-[#0D7C6C]" />
          </div>
          <h1 className="text-[22px] font-bold text-[#111827] dark:text-[#F9FAFB] mt-5">
            {title}
          </h1>
          <p className="text-[14px] text-[#6B7280] dark:text-[#D1D5DB] leading-relaxed mt-2">
            {subtitle}
          </p>
          <button
            type="button"
            onClick={() => navigate(ROUTES.register)}
            className="mt-6 h-10 px-5 inline-flex items-center text-[14px] font-semibold bg-[#0D7C6C] text-white rounded-[10px] shadow-sm hover:bg-[#0A6458] transition-colors cursor-pointer"
          >
            Create Free Account
          </button>
        </div>
      </div>
    </div>
  );
}
