import React from 'react';
import { Icon } from '@/assets/icons';

export function AIHintCard({ hint, expanded, onToggle }: { hint: string; expanded?: boolean; onToggle?: () => void }) {
  return (
    <div className="rounded-[10px] border border-[#BFDBFE] bg-[#EFF6FF] overflow-hidden">
      <button onClick={onToggle} className="w-full flex items-center gap-2.5 px-4 py-3">
        <Icon.Zap className="w-4 h-4 text-[#2563EB]" />
        <span className="text-[13.5px] font-semibold text-[#1E40AF] flex-1 text-left">AI Hint</span>
        <Icon.ChevronDown className={`w-4 h-4 text-[#2563EB] transition-transform ${expanded ? 'rotate-180' : ''}`} />
      </button>
      {expanded && <div className="px-4 pb-4 text-[13.5px] text-[#1E40AF] leading-relaxed border-t border-[#BFDBFE] pt-3">{hint}</div>}
    </div>
  );
}
