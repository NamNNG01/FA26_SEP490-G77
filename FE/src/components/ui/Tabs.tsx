import React from 'react';

export function Tabs({ tabs, active, onChange }: { tabs: string[]; active: string; onChange: (t: string) => void }) {
  return (
    <div className="flex gap-0.5 bg-[#F3F4F6] p-1 rounded-[10px]">
      {tabs.map(tab => (
        <button key={tab} onClick={() => onChange(tab)}
          className={`px-4 py-1.5 rounded-[8px] text-[13.5px] font-medium transition-all
            ${active === tab ? 'bg-white text-[#111827] shadow-sm' : 'text-[#6B7280] hover:text-[#374151]'}`}>
          {tab}
        </button>
      ))}
    </div>
  );
}
