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
    <div className="min-h-[100dvh] bg-surface-alt flex items-center justify-center px-4">
      <div role="status" aria-live="polite" className="flex flex-col items-center gap-3 text-center">
        <Icon.Logo className="w-12 h-12 flex-shrink-0 text-brand-ink" aria-hidden="true" />
        <p className="text-base text-content-soft">Loading PrepExam…</p>
        <div
          className="h-6 w-6 flex-shrink-0 border-4 border-brand-600/20 border-t-brand-600 rounded-full animate-spin"
          aria-hidden="true"
        />
      </div>
    </div>
  );
}
