import React from 'react';
import { Icon } from '@/assets/icons';

export function Pagination({ page, total, perPage = 10, onChange }: { page: number; total: number; perPage?: number; onChange: (p: number) => void }) {
  const pages = Math.ceil(total / perPage);
  const start = (page - 1) * perPage + 1;
  const end = Math.min(page * perPage, total);
  const pageNums = Array.from({ length: pages }, (_, i) => i + 1).filter(p => p === 1 || p === pages || Math.abs(p - page) <= 1);
  return (
    <div className="flex items-center justify-between px-4 py-3">
      <p className="text-[13px] text-[#6B7280]">Showing <span className="font-medium text-[#374151]">{start}–{end}</span> of <span className="font-medium text-[#374151]">{total}</span></p>
      <div className="flex items-center gap-1">
        <button onClick={() => onChange(page - 1)} disabled={page === 1}
          className="w-8 h-8 flex items-center justify-center rounded-[8px] border border-[#E5E7EB] hover:bg-[#F3F4F6] disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
          <Icon.ChevronLeft className="w-4 h-4 text-[#374151]" />
        </button>
        {pageNums.map((p, i) => {
          const prev = pageNums[i - 1];
          return (
            <React.Fragment key={p}>
              {prev && p - prev > 1 && <span className="px-1 text-[#9CA3AF]">…</span>}
              <button onClick={() => onChange(p)}
                className={`w-8 h-8 text-[13px] font-medium rounded-[8px] transition-colors
                  ${p === page ? 'bg-[#2563EB] text-white' : 'border border-[#E5E7EB] text-[#374151] hover:bg-[#F3F4F6]'}`}>
                {p}
              </button>
            </React.Fragment>
          );
        })}
        <button onClick={() => onChange(page + 1)} disabled={page === pages}
          className="w-8 h-8 flex items-center justify-center rounded-[8px] border border-[#E5E7EB] hover:bg-[#F3F4F6] disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
          <Icon.ChevronRight className="w-4 h-4 text-[#374151]" />
        </button>
      </div>
    </div>
  );
}
