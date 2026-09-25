import React from 'react';
import { useNavigate } from 'react-router';
import { Icon } from '@/assets/icons';
import { ROUTES } from '@/app/routes';

/**
 * PlaceholderPage
 *
 * Shared shell for the public placeholder pages (/pricing, /exams): a
 * lightweight "coming soon" screen so landing CTAs resolve for guests.
 * The real pages will replace these.
 */
export function PlaceholderPage({ title, subtitle }: { title: string; subtitle: string }) {
  const navigate = useNavigate();

  return (
    <div className="min-h-[100dvh] bg-gradient-to-br from-[#EFF6FF] to-white dark:from-[#0B1220] dark:to-[#111827] flex items-center justify-center p-4 sm:p-6">
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
          <div className="w-14 h-14 rounded-[14px] bg-[#EFF6FF] dark:bg-[#2563EB]/15 flex items-center justify-center mx-auto">
            <Icon.Zap className="w-7 h-7 text-[#2563EB]" />
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
            className="mt-6 h-10 px-5 inline-flex items-center text-[14px] font-semibold bg-[#2563EB] text-white rounded-[10px] shadow-sm hover:bg-[#1D4ED8] transition-colors cursor-pointer"
          >
            Create Free Account
          </button>
        </div>
      </div>
    </div>
  );
}
