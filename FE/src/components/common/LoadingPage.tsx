import React from 'react';
import { Icon } from '@/assets/icons';
import { Button } from '@/components/ui/Button';

export function LoadingPage() {
  return (
    <div className="min-h-[100dvh] bg-white flex flex-col items-center justify-center gap-4">
      <div className="w-12 h-12 bg-[#2563EB] rounded-[14px] flex items-center justify-center shadow-md">
        <Icon.Brain className="w-7 h-7 text-white" />
      </div>
      <div className="w-8 h-8 border-4 border-[#2563EB]/20 border-t-[#2563EB] rounded-full" style={{ animation: 'spin 0.8s linear infinite' }} />
      <p className="text-[14px] text-[#6B7280]">Loading CertifyAI…</p>
    </div>
  );
}

export function EmptyStatePage() {
  return (
    <div className="min-h-[100dvh] bg-[#F9FAFB] flex items-center justify-center">
      <div className="text-center max-w-md">
        <div className="w-24 h-24 bg-[#F3F4F6] rounded-[24px] flex items-center justify-center mx-auto mb-6">
          <Icon.FileText className="w-12 h-12 text-[#D1D5DB]" />
        </div>
        <h2 className="text-[22px] font-bold text-[#111827] mb-2">No content yet</h2>
        <p className="text-[14px] text-[#6B7280] mb-6">There's nothing here yet. Create your first item to get started with the platform.</p>
        <div className="flex items-center justify-center gap-3">
          <Button variant="outline">Learn more</Button>
          <Button icon={<Icon.Plus className="w-4 h-4" />}>Create First Item</Button>
        </div>
      </div>
    </div>
  );
}
