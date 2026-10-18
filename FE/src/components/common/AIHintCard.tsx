import React from 'react';
import { Icon } from '@/assets/icons';

export function AIHintCard({ hint, expanded, onToggle }: { hint: string; expanded?: boolean; onToggle?: () => void }) {
  return (
    <div className="rounded-[10px] border border-brand-line bg-primary-light overflow-hidden">
      <button type="button" aria-expanded={expanded} onClick={onToggle} className="w-full flex items-center gap-2.5 px-4 py-3">
        <Icon.Zap className="w-4 h-4 text-brand-ink" />
        <span className="text-sm font-semibold text-brand-ink-strong flex-1 text-left">AI Hint</span>
        <Icon.ChevronDown className={`w-4 h-4 text-brand-ink transition-transform ${expanded ? 'rotate-180' : ''}`} />
      </button>
      {expanded && <div className="px-4 pb-4 text-sm text-brand-ink-strong leading-relaxed border-t border-brand-line pt-3">{hint}</div>}
    </div>
  );
}
