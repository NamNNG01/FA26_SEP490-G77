import React, { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';

const MENU_WIDTH = 192; // w-48
const GAP = 6;

/**
 * The menu is portalled to <body> with fixed positioning so it is never clipped
 * by an ancestor's overflow (table cells and scroll containers in particular).
 * It anchors to the trigger's right edge, opens upward when there is no room
 * below, and closes on outside click, Escape, scroll or resize.
 */
export function Dropdown({ trigger, items }: {
  trigger: React.ReactNode;
  items: { label: string; icon?: React.ReactNode; danger?: boolean; onClick?: () => void; divider?: boolean }[];
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (ref.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    // Scrolling inside the menu itself must not close it.
    const onScroll = (e: Event) => { if (!menuRef.current?.contains(e.target as Node)) setOpen(false); };
    const close = () => setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', close);
    };
  }, [open]);

  useLayoutEffect(() => {
    if (!open) { setPos(null); return; }
    const anchor = ref.current?.getBoundingClientRect();
    const menuHeight = menuRef.current?.offsetHeight ?? 0;
    if (!anchor) return;
    const below = anchor.bottom + GAP;
    const top = below + menuHeight > window.innerHeight - 8 && anchor.top - GAP - menuHeight > 8
      ? anchor.top - GAP - menuHeight
      : below;
    const left = Math.min(Math.max(8, anchor.right - MENU_WIDTH), window.innerWidth - MENU_WIDTH - 8);
    setPos({ top, left });
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <div onClick={() => setOpen(o => !o)}>{trigger}</div>
      {open && createPortal(
        <div ref={menuRef} role="menu"
          style={{ position: 'fixed', top: pos?.top ?? 0, left: pos?.left ?? 0, width: MENU_WIDTH, visibility: pos ? 'visible' : 'hidden' }}
          className="bg-white rounded-[10px] border border-[#E5E7EB] shadow-lg z-50 py-1">
          {items.map((item, i) => item.divider
            ? <div key={i} className="my-1 border-t border-[#F3F4F6]" />
            : (
              <button key={i} role="menuitem" onClick={() => { item.onClick?.(); setOpen(false); }}
                className={`w-full flex items-center gap-2.5 px-3 py-2 text-[13.5px] text-left hover:bg-[#F9FAFB] transition-colors ${item.danger ? 'text-[#DC2626]' : 'text-[#374151]'}`}>
                {item.icon && <span className="w-4 h-4">{item.icon}</span>}
                {item.label}
              </button>
            )
          )}
        </div>,
        document.body,
      )}
    </div>
  );
}
