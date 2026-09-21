import React, { useState, useRef, useEffect } from 'react';

export function Dropdown({ trigger, items }: {
  trigger: React.ReactNode;
  items: { label: string; icon?: React.ReactNode; danger?: boolean; onClick?: () => void; divider?: boolean }[];
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);
  return (
    <div ref={ref} className="relative">
      <div onClick={() => setOpen(o => !o)}>{trigger}</div>
      {open && (
        <div className="absolute right-0 top-full mt-1.5 w-48 bg-white rounded-[10px] border border-[#E5E7EB] shadow-lg z-50 py-1">
          {items.map((item, i) => item.divider
            ? <div key={i} className="my-1 border-t border-[#F3F4F6]" />
            : (
              <button key={i} onClick={() => { item.onClick?.(); setOpen(false); }}
                className={`w-full flex items-center gap-2.5 px-3 py-2 text-[13.5px] text-left hover:bg-[#F9FAFB] transition-colors ${item.danger ? 'text-[#DC2626]' : 'text-[#374151]'}`}>
                {item.icon && <span className="w-4 h-4">{item.icon}</span>}
                {item.label}
              </button>
            )
          )}
        </div>
      )}
    </div>
  );
}
