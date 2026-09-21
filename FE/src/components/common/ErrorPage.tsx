import React from 'react';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/assets/icons';

export function ErrorPage({ code = 404 }: { code?: number }) {
  const messages: Record<number, { title: string; desc: string }> = {
    404: { title: 'Page not found', desc: 'The page you are looking for doesn\'t exist or has been moved.' },
    403: { title: 'Access denied', desc: 'You don\'t have permission to access this resource.' },
    500: { title: 'Server error', desc: 'Something went wrong on our end. Please try again later.' },
  };
  const m = messages[code] || messages[404];
  return (
    <div className="min-h-screen bg-[#F9FAFB] flex items-center justify-center">
      <div className="text-center">
        <p className="text-[100px] font-black text-[#F3F4F6] leading-none">{code}</p>
        <h2 className="text-[26px] font-bold text-[#111827] -mt-4">{m.title}</h2>
        <p className="text-[15px] text-[#6B7280] mt-2 mb-8 max-w-sm">{m.desc}</p>
        <div className="flex items-center justify-center gap-3">
          <Button variant="outline" icon={<Icon.ChevronLeft className="w-4 h-4" />}>Go Back</Button>
          <Button icon={<Icon.Home className="w-4 h-4" />}>Go Home</Button>
        </div>
      </div>
    </div>
  );
}
