import React, { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '@/assets/icons';

const GAP = 4;

/** Picked types with how many of each, as typed (a key present = the type is picked). */
export type TypeCounts<T extends string> = Partial<Record<T, string>>;

/**
 * Dropdown like <MultiSelect>, but every type has its own count box next to
 * its checkbox — "5 Single Choice + 2 Essay" in one control. Picking a type
 * starts it at `defaultCount`. The menu is portalled to <body> so scroll
 * containers don't clip it; it closes on outside click, Escape, scroll or resize.
 */
export function TypeCountSelect<T extends string>({ label, options, value, onChange, min, max, defaultCount = 5, placeholder = 'Pick types', header, error, disabled, className = '' }: {
  label?: string;
  /** `max` caps that option below the shared `max`; `hint` is shown next to it in the menu only (not in the summary). */
  options: { label: string; value: T; max?: number; hint?: string }[];
  value: TypeCounts<T>;
  onChange: (v: TypeCounts<T>) => void;
  min: number;
  max: number;
  defaultCount?: number;
  placeholder?: string;
  /** Menu header; default "Questions per type (min–max)". */
  header?: string;
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

  // Rebuilt in the options' order, not the click order.
  const ordered = (next: TypeCounts<T>): TypeCounts<T> =>
    Object.fromEntries(options.filter(o => next[o.value] !== undefined).map(o => [o.value, next[o.value]])) as TypeCounts<T>;

  const maxOf = (t: T) => Math.min(max, options.find(o => o.value === t)?.max ?? max);
  const toggle = (t: T) => {
    const next = { ...value };
    if (next[t] !== undefined) delete next[t];
    else next[t] = String(Math.min(defaultCount, maxOf(t)));
    onChange(ordered(next));
  };
  const setCount = (t: T, count: string) => onChange(ordered({ ...value, [t]: count }));

  const picked = options.filter(o => value[o.value] !== undefined);
  const summary = picked.length === 0 ? placeholder : picked.map(o => `${value[o.value] || '?'} ${o.label}`).join(', ');
  const countInvalid = (t: T, c: string | undefined) => {
    const n = Number(c);
    return !(Number.isInteger(n) && n >= min && n <= maxOf(t));
  };

  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      {label && <label htmlFor={id} className="text-sm font-medium text-content-secondary">{label}</label>}
      <button
        id={id}
        ref={triggerRef}
        type="button"
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-invalid={Boolean(error)}
        onClick={() => setOpen(o => !o)}
        title={summary}
        className={`relative w-full h-9 pl-3 pr-9 rounded-[10px] border bg-surface text-base text-left truncate focus:outline-none focus:ring-2 transition-all ${
          error ? 'border-danger-solid focus:ring-danger-solid/20' : 'border-line focus:ring-brand-600/20 focus:border-brand-600'
        } ${picked.length ? 'text-content' : 'text-content-subtle'} ${disabled ? 'cursor-not-allowed bg-surface-alt text-content-subtle' : 'cursor-pointer'}`}
      >
        {summary}
        <Icon.ChevronDown className={`absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-content-subtle pointer-events-none transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {error && <p className="text-xs text-danger">{error}</p>}

      {open && createPortal(
        <div
          ref={menuRef}
          role="dialog"
          aria-labelledby={id}
          style={{ position: 'fixed', top: pos?.top ?? 0, left: pos?.left ?? 0, minWidth: Math.max(pos?.width ?? 0, 280), visibility: pos ? 'visible' : 'hidden' }}
          className="bg-surface rounded-[10px] border border-line shadow-lg z-50 py-1 max-h-80 overflow-y-auto"
        >
          <div className="flex items-center justify-between gap-3 px-3 py-1.5 border-b border-line-soft text-xs">
            <span className="text-content-subtle">{header ?? `Questions per type (${min}–${max})`}</span>
            <button type="button" className="text-content-soft hover:underline disabled:opacity-40" disabled={!picked.length} onClick={() => onChange({})}>Clear</button>
          </div>
          {options.map(o => {
            const checked = value[o.value] !== undefined;
            const bad = checked && countInvalid(o.value, value[o.value]);
            return (
              <div key={o.value} className="flex items-center gap-2.5 px-3 py-1.5 hover:bg-surface-hover">
                <label className="flex flex-1 min-w-0 items-center gap-2.5 py-0.5 text-sm text-content-secondary cursor-pointer">
                  <input type="checkbox" checked={checked} onChange={() => toggle(o.value)} className="w-4 h-4 accent-brand-600" />
                  <span className="truncate">{o.label}</span>
                  {o.hint && <span className="flex-shrink-0 text-xs text-content-subtle">{o.hint}</span>}
                </label>
                <input
                  type="number"
                  min={min}
                  max={maxOf(o.value)}
                  inputMode="numeric"
                  value={value[o.value] ?? ''}
                  placeholder="—"
                  disabled={!checked}
                  onChange={e => setCount(o.value, e.target.value)}
                  aria-label={`Number of ${o.label} questions`}
                  aria-invalid={bad}
                  className={`w-16 h-8 px-2 rounded-[8px] border text-sm text-content bg-surface text-right focus:outline-none focus:ring-2 disabled:bg-surface-alt disabled:text-content-subtle ${
                    bad ? 'border-danger-solid focus:ring-danger-solid/20' : 'border-line focus:ring-brand-600/20 focus:border-brand-600'
                  }`}
                />
              </div>
            );
          })}
        </div>,
        document.body,
      )}
    </div>
  );
}
