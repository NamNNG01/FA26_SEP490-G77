import React from 'react';
import { Icon } from '@/assets/icons';
import { Button } from '@/components/ui/Button';

export function LoadingPage() {
  return (
    <div className="min-h-[100dvh] bg-surface flex flex-col items-center justify-center gap-4">
      <Icon.Logo className="w-12 h-12 flex-shrink-0 text-brand-ink" aria-hidden="true" />
      <div className="w-8 h-8 border-4 border-brand-600/20 border-t-brand-600 rounded-full" style={{ animation: 'spin 0.8s linear infinite' }} />
      <p className="text-base text-content-soft">Loading PrepExam…</p>
    </div>
  );
}

export function EmptyStatePage() {
  return (
    <div className="min-h-[100dvh] bg-surface-alt flex items-center justify-center">
      <div className="text-center max-w-md">
        <div className="w-24 h-24 bg-surface-muted rounded-[24px] flex items-center justify-center mx-auto mb-6">
          <Icon.FileText className="w-12 h-12 text-content-faint" />
        </div>
        <h2 className="text-xl font-bold text-content mb-2">No content yet</h2>
        <p className="text-base text-content-soft mb-6">There's nothing here yet. Create your first item to get started with the platform.</p>
        <div className="flex items-center justify-center gap-3">
          <Button variant="outline">Learn more</Button>
          <Button icon={<Icon.Plus className="w-4 h-4" />}>Create First Item</Button>
        </div>
      </div>
    </div>
  );
}
