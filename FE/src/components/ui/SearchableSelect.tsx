import React, { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '@/assets/icons';

const GAP = 4;

/**
 * <Select> with a search box — for long option lists such as courses. Type to
 * narrow the list, ↑/↓ to move, Enter to pick, Escape to close. The menu is
 * portalled to <body> (like <MultiSelect>) so scroll containers don't clip it.
 */
export function SearchableSelect({ label, options, value, onChange, placeholder = 'Select…', searchPlaceholder = 'Search…', emptyText = 'No matches', disabled, className = '', 'aria-label': ariaLabel }: {
  label?: string;
  options: { label: string; value: string }[];
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  disabled?: boolean;
  className?: string;
  'aria-label'?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const id = useId();

  const q = query.trim().toLowerCase();
  const filtered = q ? options.filter(o => o.label.toLowerCase().includes(q)) : options;
  const selected = options.find(o => o.value === value);

  const close = (refocus = false) => {
    setOpen(false);
    if (refocus) triggerRef.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setActive(Math.max(0, options.findIndex(o => o.value === value)));
    requestAnimationFrame(() => searchRef.current?.focus());
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onScroll = (e: Event) => { if (!menuRef.current?.contains(e.target as Node)) setOpen(false); };
    const onResize = () => setOpen(false);
    document.addEventListener('mousedown', onDown);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onResize);
    return () => {
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onResize);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset only when the menu opens
  }, [open]);

  useLayoutEffect(() => {
    if (!open) { setPos(null); return; }
    const anchor = triggerRef.current?.getBoundingClientRect();
    const menuHeight = menuRef.current?.offsetHeight ?? 0;
    if (!anchor) return;
    const below = anchor.bottom + GAP;
    const top = below + menuHeight > window.innerHeight - 8 && anchor.top - GAP - menuHeight > 8
      ? anchor.top - GAP - menuHeight
      : below;
    setPos({ top, left: anchor.left, width: anchor.width });
  }, [open]);

  // Keep the highlighted option in view while moving with the keyboard.
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const pick = (v: string) => {
    onChange(v);
    close(true);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(i => Math.min(filtered.length - 1, i + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(i => Math.max(0, i - 1)); }
    else if (e.key === 'Enter') { e.preventDefault(); if (filtered[active]) pick(filtered[active].value); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(true); }
    else if (e.key === 'Tab') close();
  };

  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      {label && <label htmlFor={id} className="text-sm font-medium text-content-secondary">{label}</label>}
      <button
        id={id}
        ref={triggerRef}
        type="button"
        disabled={disabled}
        aria-label={label ? undefined : ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen(o => !o)}
        onKeyDown={e => { if ((e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') && !open) { e.preventDefault(); setOpen(true); } }}
        title={selected?.label}
        className={`relative w-full h-9 pl-3 pr-9 rounded-[10px] border border-line bg-surface text-base text-left truncate focus:outline-none focus:ring-2 focus:ring-brand-600/20 focus:border-brand-600 transition-all ${
          selected ? 'text-content' : 'text-content-subtle'
        } ${disabled ? 'cursor-not-allowed bg-surface-alt text-content-subtle' : 'cursor-pointer'}`}
      >
        {selected?.label ?? placeholder}
        <Icon.ChevronDown className={`absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-content-subtle pointer-events-none transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && createPortal(
        <div
          ref={menuRef}
          style={{ position: 'fixed', top: pos?.top ?? 0, left: pos?.left ?? 0, width: Math.max(pos?.width ?? 0, 220), visibility: pos ? 'visible' : 'hidden' }}
          className="bg-surface rounded-[10px] border border-line shadow-lg z-50 overflow-hidden"
        >
          <div className="relative border-b border-line-soft p-1.5">
            <Icon.Search className="absolute left-4 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-content-subtle" />
            <input
              ref={searchRef}
              value={query}
              onChange={e => { setQuery(e.target.value); setActive(0); }}
              onKeyDown={onKeyDown}
              placeholder={searchPlaceholder}
              role="combobox"
              aria-expanded
              aria-controls={`${id}-list`}
              aria-activedescendant={filtered[active] ? `${id}-opt-${active}` : undefined}
              className="w-full h-8 pl-8 pr-2 rounded-[8px] border border-line bg-surface text-sm text-content placeholder:text-content-subtle focus:outline-none focus:ring-2 focus:ring-brand-600/20 focus:border-brand-600"
            />
          </div>
          <ul ref={listRef} id={`${id}-list`} role="listbox" className="max-h-64 overflow-y-auto py-1">
            {filtered.length === 0 && <li className="px-3 py-2 text-sm text-content-subtle">{emptyText}</li>}
            {filtered.map((o, i) => {
              const isSelected = o.value === value;
              return (
                <li
                  key={o.value}
                  id={`${id}-opt-${i}`}
                  data-index={i}
                  role="option"
                  aria-selected={isSelected}
                  onMouseEnter={() => setActive(i)}
                  onMouseDown={e => e.preventDefault()}
                  onClick={() => pick(o.value)}
                  className={`flex items-center gap-2 px-3 py-2 text-sm cursor-pointer ${i === active ? 'bg-surface-hover' : ''} ${isSelected ? 'font-medium text-brand-ink' : 'text-content-secondary'}`}
                >
                  <span className="flex-1 truncate" title={o.label}>{o.label}</span>
                  {isSelected && <Icon.Check className="w-4 h-4 flex-shrink-0" />}
                </li>
              );
            })}
          </ul>
        </div>,
        document.body,
      )}
    </div>
  );
}
