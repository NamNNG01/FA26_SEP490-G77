import React from 'react';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/assets/icons';

/**
 * DashboardState
 *
 * Shared loading/error UI for every role's dashboard:
 *  - loading → skeleton cards (no mock data flashes).
 *  - error   → empty state with a Retry button; never crashes the page.
 */

export function DashboardSkeleton({ cards = 3 }: { cards?: number }) {
  return (
    <div className="p-8 space-y-7">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {Array.from({ length: cards }).map((_, i) => (
          <div key={i} className="card p-5 flex flex-col gap-4">
            <div className="skeleton h-4 w-24 rounded" />
            <div className="skeleton h-8 w-16 rounded" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="card p-5 space-y-3">
            <div className="skeleton h-20 rounded" />
            <div className="skeleton h-3 w-3/4 rounded" />
            <div className="skeleton h-3 w-1/2 rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function DashboardError({
  message = 'Unable to load dashboard.',
  onRetry,
}: {
  message?: string;
  onRetry: () => void;
}) {
  return (
    <div className="p-8">
      <div className="card p-10 flex flex-col items-center text-center max-w-md mx-auto">
        <div className="w-20 h-20 bg-[#F3F4F6] dark:bg-[#1F2937] rounded-[20px] flex items-center justify-center mb-5">
          <Icon.AlertCircle className="w-10 h-10 text-muted-foreground" />
        </div>
        <h3 className="text-[16px] font-semibold text-foreground mb-1.5">
          Something went wrong
        </h3>
        <p className="text-[13.5px] text-muted-foreground mb-6">{message}</p>
        <Button variant="outline" icon={<Icon.RefreshCw className="w-4 h-4" />} onClick={onRetry}>
          Retry
        </Button>
      </div>
    </div>
  );
}
