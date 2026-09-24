import React, { useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Checkbox } from '@/components/ui/Checkbox';
import { Pagination, usePagination } from '@/components/ui/Pagination';
import { SearchInput } from '@/components/common/SearchInput';
import { Icon } from '@/assets/icons';
import type { BankQuestion } from '../mockQuestionBank';
import { difficultyLabel, difficultyVariant, MOCK_QUESTION_BANK } from '../mockQuestionBank';

export function ModuleQuestionList({ moduleId, selected, onToggle, onPreview }: {
  moduleId: string;
  selected: BankQuestion[];
  onToggle: (q: BankQuestion) => void;
  onPreview: (q: BankQuestion) => void;
}) {
  const [query, setQuery] = useState('');

  const q = query.trim().toLowerCase();
  const filtered = moduleId
    ? MOCK_QUESTION_BANK.filter(b =>
      b.moduleId === moduleId && (!q || b.text.toLowerCase().includes(q) || b.topic.toLowerCase().includes(q)))
    : [];
  const selectedIds = new Set(selected.map(s => s.id));
  const { page, pageItems: paged, setPage } = usePagination(filtered, { resetKey: `${moduleId}|${q}` });

  return (
    <div className="card overflow-hidden">
      <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-[#F3F4F6]">
        <SearchInput className="w-56" placeholder="Search questions…" value={query} onChange={e => setQuery(e.target.value)} />
        <div className="flex-1" />
        <Badge variant="default">{filtered.length} in module · {selected.length} selected</Badge>
      </div>

      {!moduleId ? (
        <p className="px-4 py-10 text-[13px] text-[#9CA3AF] text-center">Select a module in the Exam Information panel to load its questions.</p>
      ) : filtered.length === 0 ? (
        <p className="px-4 py-10 text-[13px] text-[#9CA3AF] text-center">No questions match the current search.</p>
      ) : (
        <div className="divide-y divide-[#F9FAFB]">
          {paged.map(b => {
            const checked = selectedIds.has(b.id);
            return (
              <div key={b.id} onClick={() => onToggle(b)}
                className={`flex items-center gap-3 px-4 py-3 cursor-pointer select-none hover:bg-[#F9FAFB] transition-colors ${checked ? 'bg-[#F0FDF4]' : ''}`}>
                <span onClick={e => e.stopPropagation()}>
                  <Checkbox checked={checked} onChange={() => onToggle(b)} />
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] text-[#374151] line-clamp-1">{b.text}</p>
                  <div className="flex items-center gap-1.5 mt-1">
                    <Badge variant={difficultyVariant(b.difficulty)} className="text-[11px]">{difficultyLabel(b.difficulty)}</Badge>
                    <Badge variant="default" className="text-[11px]">{b.type.toUpperCase()}</Badge>
                    <span className="text-[11px] text-[#9CA3AF]">{b.pts} pts</span>
                  </div>
                </div>
                <button onClick={e => { e.stopPropagation(); onPreview(b); }}
                  className="flex items-center gap-1 text-[12px] font-medium text-[#2563EB] hover:underline">
                  <Icon.Eye className="w-4 h-4" /> Preview
                </button>
              </div>
            );
          })}
        </div>
      )}

      {moduleId && (
        <div className="border-t border-[#F3F4F6]">
          <Pagination page={page} total={filtered.length} onChange={setPage} unit="questions" />
        </div>
      )}
    </div>
  );
}