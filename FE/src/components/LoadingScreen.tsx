import React from 'react';
import { Icon } from '@/assets/icons';

/**
 * LoadingScreen
 *
 * Shown on first load while the auth state is being restored from storage.
 * Does not briefly render Header/Sidebar before redirecting.
 */
export function LoadingScreen() {
  return (
    <div className="min-h-[100dvh] bg-[#F9FAFB] flex items-center justify-center">
      <div className="text-center">
        <div className="w-12 h-12 bg-[#0D7C6C] rounded-[14px] flex items-center justify-center mx-auto mb-4">
          <Icon.Logo className="w-7 h-7 text-white" />
        </div>
        <p className="text-[14px] text-[#6B7280]">Loading PrepExam…</p>
        <div className="mt-3 h-6 w-6 border-4 border-[#0D7C6C]/20 border-t-[#0D7C6C] rounded-full animate-spin" />
      </div>
    </div>
  );
}
