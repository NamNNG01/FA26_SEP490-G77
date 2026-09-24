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
    <div className="min-h-screen bg-[#F9FAFB] flex items-center justify-center">
      <div className="text-center">
        <div className="w-12 h-12 bg-[#2563EB] rounded-[14px] flex items-center justify-center mx-auto mb-4">
          <Icon.Brain className="w-7 h-7 text-white" />
        </div>
        <p className="text-[14px] text-[#6B7280]">Loading CertifyAI…</p>
        <div className="mt-3 h-6 w-6 border-4 border-[#2563EB]/20 border-t-[#2563EB] rounded-full animate-spin" />
      </div>
    </div>
  );
}
