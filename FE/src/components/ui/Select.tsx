import React, { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '@/assets/icons';

const GAP = 4;

/**
 * Single-value dropdown with the same look as <MultiSelect> and
 * <SearchableSelect> (instead of the browser's native <select> menu). The
 * menu is portalled to <body> so scroll containers don't clip it; it closes
 * on outside click, Escape, Tab, scroll or resize. ↑/↓/Home/End move,
 * Enter/Space pick, typing a letter jumps to the next matching option.
 */
export function Select({ label, options, value, onChange, className = '', triggerClassName, disabled, error, invalid, id: idProp, 'aria-label': ariaLabel, maxVisibleOptions }: {
  label?: string; options: { label: string; value: string }[]; value?: string;
  onChange?: (v: string) => void; className?: string; disabled?: boolean;
  /** Replaces the trigger's size/typography classes (e.g. a compact pill); the colours and menu stay the same. */
  triggerClassName?: string;
  error?: string;
  /** Red border without a message — the error is reported elsewhere (e.g. a toast). */
  invalid?: boolean;
  id?: string;
  /** Accessible name for filter-style selects that render no visible label. */
  'aria-label'?: string;
  /** Rows the open menu shows before it scrolls (default: up to max-h-72). */
  maxVisibleOptions?: number;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);
  const autoId = useId();
  const id = idProp ?? autoId;

  const selectedIndex = options.findIndex(o => o.value === (value ?? ''));
  const selected = selectedIndex >= 0 ? options[selectedIndex] : undefined;

  const close = (refocus = false) => {
    setOpen(false);
    if (refocus) triggerRef.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    setActive(Math.max(0, selectedIndex));
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
    if (open) menuRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active, open]);

  const pick = (v: string) => {
    if (v !== value) onChange?.(v);
    close(true);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(true); }
      return;
    }
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(i => Math.min(options.length - 1, i + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(i => Math.max(0, i - 1)); }
    else if (e.key === 'Home') { e.preventDefault(); setActive(0); }
    else if (e.key === 'End') { e.preventDefault(); setActive(options.length - 1); }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (options[active]) pick(options[active].value); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(true); }
    else if (e.key === 'Tab') close();
    else if (e.key.length === 1 && /\S/.test(e.key)) {
      // Type-ahead: the next option starting with the typed letter.
      const ch = e.key.toLowerCase();
      for (let step = 1; step <= options.length; step++) {
        const i = (active + step) % options.length;
        if (options[i].label.toLowerCase().startsWith(ch)) { setActive(i); break; }
      }
    }
  };

  const sizeCls = triggerClassName ?? 'w-full h-9 pl-3 pr-9 rounded-[10px] text-base';

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
        aria-controls={open ? `${id}-list` : undefined}
        aria-activedescendant={open && options[active] ? `${id}-opt-${active}` : undefined}
        aria-invalid={error || invalid ? true : undefined}
        onClick={() => setOpen(o => !o)}
        onKeyDown={onKeyDown}
        title={selected?.label}
        className={`relative ${sizeCls} border bg-surface text-left truncate focus:outline-none focus:ring-2 transition-all ${
          error || invalid ? 'border-danger-solid focus:ring-danger-solid/20' : 'border-line focus:ring-brand-600/20 focus:border-brand-600'
        } ${disabled ? 'cursor-not-allowed bg-surface-alt text-content-subtle' : `cursor-pointer ${selected ? 'text-content' : 'text-content-subtle'}`}`}
      >
        {selected?.label ?? options[0]?.label ?? ''}
        <Icon.ChevronDown className={`absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-content-subtle pointer-events-none transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {error && <p className="text-xs text-danger">{error}</p>}

      {open && createPortal(
        <ul
          ref={menuRef}
          id={`${id}-list`}
          role="listbox"
          aria-labelledby={label ? id : undefined}
          aria-label={label ? undefined : ariaLabel}
          style={{
            position: 'fixed', top: pos?.top ?? 0, left: pos?.left ?? 0, minWidth: pos?.width ?? 0, visibility: pos ? 'visible' : 'hidden',
            // One option row is 36px (py-2 + 20px line), plus the list's 4px top and bottom padding.
            ...(maxVisibleOptions ? { maxHeight: maxVisibleOptions * 36 + 8 } : {}),
          }}
          className="bg-surface rounded-[10px] border border-line shadow-lg z-50 py-1 max-h-72 overflow-y-auto"
        >
          {options.map((o, i) => {
            const isSelected = i === selectedIndex;
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
                className={`flex items-center gap-2.5 px-3 py-2 text-sm cursor-pointer ${i === active ? 'bg-surface-hover' : ''} ${
                  isSelected ? 'font-medium text-brand-ink' : 'text-content-secondary'
                }`}
              >
                <span className="flex-1 truncate" title={o.label}>{o.label}</span>
                {isSelected && <Icon.Check className="w-4 h-4 flex-shrink-0" />}
              </li>
            );
          })}
        </ul>,
        document.body,
      )}
    </div>
  );
}
