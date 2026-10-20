import React, { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '@/assets/icons';

const GAP = 4;

/**
 * Dropdown with checkboxes — looks like <Select>, picks several values.
 * The menu is portalled to <body> (like <Dropdown>) so scroll containers
 * don't clip it; it closes on outside click, Escape, scroll or resize.
 */
export function MultiSelect<T extends string>({ label, options, value, onChange, placeholder = 'Select…', error, disabled, className = '' }: {
  label?: string;
  options: { label: string; value: T }[];
  value: T[];
  onChange: (v: T[]) => void;
  placeholder?: string;
  error?: string;
  disabled?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setOpen(false); triggerRef.current?.focus(); }
    };
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
    const anchor = triggerRef.current?.getBoundingClientRect();
    const menuHeight = menuRef.current?.offsetHeight ?? 0;
    if (!anchor) return;
    const below = anchor.bottom + GAP;
    const top = below + menuHeight > window.innerHeight - 8 && anchor.top - GAP - menuHeight > 8
      ? anchor.top - GAP - menuHeight
      : below;
    setPos({ top, left: anchor.left, width: anchor.width });
  }, [open]);

  const toggle = (v: T) => {
    const next = value.includes(v) ? value.filter(x => x !== v) : [...value, v];
    // Keep the options' order, not the click order.
    onChange(options.map(o => o.value).filter(o => next.includes(o)));
  };

  const selected = options.filter(o => value.includes(o.value));
  const summary = selected.length === 0 ? placeholder
    : selected.length <= 2 ? selected.map(o => o.label).join(', ')
    : `${selected.length} selected`;

  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      {label && <label htmlFor={id} className="text-sm font-medium text-content-secondary">{label}</label>}
      <button
        id={id}
        ref={triggerRef}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-invalid={Boolean(error)}
        onClick={() => setOpen(o => !o)}
        title={selected.map(o => o.label).join(', ')}
        className={`relative w-full h-9 pl-3 pr-9 rounded-[10px] border bg-surface text-base text-left truncate focus:outline-none focus:ring-2 transition-all ${
          error ? 'border-danger-solid focus:ring-danger-solid/20' : 'border-line focus:ring-brand-600/20 focus:border-brand-600'
        } ${selected.length ? 'text-content' : 'text-content-subtle'} ${disabled ? 'cursor-not-allowed bg-surface-alt text-content-subtle' : 'cursor-pointer'}`}
      >
        {summary}
        <Icon.ChevronDown className={`absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-content-subtle pointer-events-none transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {error && <p className="text-xs text-danger">{error}</p>}

      {open && createPortal(
        <div
          ref={menuRef}
          role="listbox"
          aria-multiselectable="true"
          aria-labelledby={id}
          style={{ position: 'fixed', top: pos?.top ?? 0, left: pos?.left ?? 0, minWidth: pos?.width ?? 0, visibility: pos ? 'visible' : 'hidden' }}
          className="bg-surface rounded-[10px] border border-line shadow-lg z-50 py-1 max-h-72 overflow-y-auto"
        >
          <div className="flex items-center justify-between gap-3 px-3 py-1.5 border-b border-line-soft text-xs">
            <button type="button" className="font-medium text-brand-ink hover:underline" onClick={() => onChange(options.map(o => o.value))}>Select all</button>
            <button type="button" className="text-content-soft hover:underline disabled:opacity-40" disabled={!value.length} onClick={() => onChange([])}>Clear</button>
          </div>
          {options.map(o => {
            const checked = value.includes(o.value);
            return (
              <label key={o.value} role="option" aria-selected={checked} className="flex items-center gap-2.5 px-3 py-2 text-sm text-content-secondary hover:bg-surface-hover cursor-pointer">
                <input type="checkbox" checked={checked} onChange={() => toggle(o.value)} className="w-4 h-4 accent-brand-600" />
                {o.label}
              </label>
            );
          })}
        </div>,
        document.body,
      )}
    </div>
  );
}
