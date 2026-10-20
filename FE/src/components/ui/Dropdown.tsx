import React, { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '@/assets/icons';

const MENU_WIDTH = 192;
const GAP = 6;

export interface DropdownItem {
  label: string;
  value?: string | number;
  icon?: React.ReactNode;
  danger?: boolean;
  selected?: boolean;
  onClick?: () => void;
  divider?: boolean;
}

export interface DropdownProps {
  trigger: React.ReactNode;
  items: DropdownItem[];
  value?: string | number;
  onSelect?: (value: string | number) => void;
  search?: boolean;
  searchPlaceholder?: string;
  className?: string;
}

export function Dropdown({
  trigger,
  items,
  value,
  onSelect,
  search = false,
  searchPlaceholder = 'Search...',
  className = '',
}: DropdownProps) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) {
      setSearchQuery('');
      return;
    }
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (ref.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
      setSearchQuery('');
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        setSearchQuery('');
      }
    };
    const onScroll = (e: Event) => {
      const target = e.target as Node;
      if (menuRef.current?.contains(target)) return;
      setOpen(false);
      setSearchQuery('');
    };
    const close = () => {
      setOpen(false);
      setSearchQuery('');
    };
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

  useEffect(() => {
    if (open && search) {
      const timer = setTimeout(() => {
        searchInputRef.current?.focus({ preventScroll: true });
      }, 40);
      return () => clearTimeout(timer);
    }
  }, [open, search]);

  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    const anchor = ref.current?.getBoundingClientRect();
    const menuHeight = menuRef.current?.offsetHeight ?? 0;
    if (!anchor) return;
    const width = Math.max(MENU_WIDTH, Math.round(anchor.width));
    const below = anchor.bottom + GAP;
    const top =
      below + menuHeight > window.innerHeight - 8 && anchor.top - GAP - menuHeight > 8
        ? anchor.top - GAP - menuHeight
        : below;
    const left =
      anchor.width >= MENU_WIDTH
        ? Math.min(Math.max(8, anchor.left), window.innerWidth - width - 8)
        : Math.min(Math.max(8, anchor.right - width), window.innerWidth - width - 8);
    setPos({ top, left, width });
  }, [open]);

  const filteredItems =
    search && searchQuery.trim()
      ? items.filter(
          (item) =>
            item.divider ||
            item.label.toLowerCase().includes(searchQuery.trim().toLowerCase())
        )
      : items;

  const hasVisibleItems = filteredItems.some((item) => !item.divider);

  const handleItemSelect = (item: DropdownItem) => {
    item.onClick?.();
    if (item.value !== undefined) {
      onSelect?.(item.value);
    }
    setOpen(false);
    setSearchQuery('');
  };

  return (
    <div ref={ref} className={`relative ${className}`}>
      <div onClick={() => setOpen((o) => !o)}>{trigger}</div>
      {open &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            style={{
              position: 'fixed',
              top: pos?.top ?? 0,
              left: pos?.left ?? 0,
              width: pos?.width ?? MENU_WIDTH,
              visibility: pos ? 'visible' : 'hidden',
            }}
            className="bg-surface rounded-[10px] border border-line shadow-xl z-[9999] py-1 overflow-hidden"
          >
            {search && (
              <div className="p-2 border-b border-line-soft" onClick={(e) => e.stopPropagation()}>
                <div className="relative flex items-center">
                  <input
                    ref={searchInputRef}
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder={searchPlaceholder}
                    className="w-full px-2.5 py-1.5 text-xs rounded-md border border-line bg-surface text-content placeholder:text-content-soft focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      className="absolute right-2 text-content-soft hover:text-content text-xs font-bold leading-none"
                    >
                      ×
                    </button>
                  )}
                </div>
              </div>
            )}
            <div className="max-h-60 overflow-y-auto py-1">
              {hasVisibleItems ? (
                filteredItems.map((item, i) => {
                  if (item.divider) {
                    return <div key={i} className="my-1 border-t border-line-soft" />;
                  }

                  const isSelected = Boolean(
                    item.selected ||
                      (value !== undefined &&
                        item.value !== undefined &&
                        String(item.value) === String(value))
                  );

                  return (
                    <button
                      key={i}
                      type="button"
                      role="menuitem"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        handleItemSelect(item);
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleItemSelect(item);
                      }}
                      className={`w-full flex items-center justify-between gap-2.5 px-3 py-2 text-sm text-left hover:bg-surface-hover transition-colors ${
                        isSelected
                          ? 'bg-primary/10 text-primary font-medium'
                          : item.danger
                          ? 'text-danger'
                          : 'text-content-secondary'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        {item.icon && <span className="w-4 h-4 shrink-0">{item.icon}</span>}
                        <span className="truncate">{item.label}</span>
                      </div>
                      {isSelected && <Icon.Check className="w-4 h-4 text-primary shrink-0" />}
                    </button>
                  );
                })
              ) : (
                <div className="px-3 py-4 text-xs text-center text-content-soft">
                  No options found
                </div>
              )}
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
