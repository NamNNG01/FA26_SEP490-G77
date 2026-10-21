import React, { useState, useRef, useEffect, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import { Icon } from "@/assets/icons";

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

export interface DropdownBaseProps {
  trigger: React.ReactNode;
  items: DropdownItem[];
  search?: boolean;
  searchPlaceholder?: string;
  className?: string;
}

export interface DropdownSingleProps extends DropdownBaseProps {
  multi?: false;
  value?: string | number;
  onSelect?: (value: string | number) => void;
  values?: never;
  onSelectMulti?: never;
}

export interface DropdownMultiProps extends DropdownBaseProps {
  multi: true;
  values?: (string | number)[];
  onSelectMulti?: (values: (string | number)[]) => void;
  value?: never;
  onSelect?: never;
}

export type DropdownProps = DropdownSingleProps | DropdownMultiProps;

export function Dropdown(props: DropdownProps) {
  const {
    trigger,
    items,
    search = false,
    searchPlaceholder = "Search...",
    className = "",
  } = props;

  const isMulti = props.multi === true;
  const singleValue = !isMulti ? props.value : undefined;
  const multiValues = isMulti ? (props.values ?? []) : [];

  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) {
      setSearchQuery("");
      return;
    }
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (ref.current?.contains(t) || menuRef.current?.contains(t)) return;
      if (isMulti) return;
      setOpen(false);
      setSearchQuery("");
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        setSearchQuery("");
      }
    };
    const onScroll = (e: Event) => {
      const target = e.target as Node;
      if (menuRef.current?.contains(target)) return;
      setOpen(false);
      setSearchQuery("");
    };
    const onResize = () => {
      setOpen(false);
      setSearchQuery("");
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
    };
  }, [open, isMulti]);

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
      below + menuHeight > window.innerHeight - 8 &&
      anchor.top - GAP - menuHeight > 8
        ? anchor.top - GAP - menuHeight
        : below;
    const left =
      anchor.width >= MENU_WIDTH
        ? Math.min(Math.max(8, anchor.left), window.innerWidth - width - 8)
        : Math.min(
            Math.max(8, anchor.right - width),
            window.innerWidth - width - 8,
          );
    setPos({ top, left, width });
  }, [open]);

  const filteredItems =
    search && searchQuery.trim()
      ? items.filter(
          (item) =>
            item.divider ||
            item.label.toLowerCase().includes(searchQuery.trim().toLowerCase()),
        )
      : items;

  const hasVisibleItems = filteredItems.some((item) => !item.divider);

  const isItemSelected = (item: DropdownItem): boolean => {
    if (item.selected) return true;
    if (item.value === undefined) return false;
    if (isMulti) {
      return multiValues.some((v) => String(v) === String(item.value));
    }
    return (
      singleValue !== undefined && String(item.value) === String(singleValue)
    );
  };

  const handleItemSelect = (item: DropdownItem) => {
    if (isMulti) {
      const itemValue = item.value;
      if (itemValue === undefined) return;
      const alreadySelected = multiValues.some(
        (v) => String(v) === String(itemValue),
      );
      const next = alreadySelected
        ? multiValues.filter((v) => String(v) !== String(itemValue))
        : [...multiValues, itemValue];
      (props as DropdownMultiProps).onSelectMulti?.(next);
      item.onClick?.();
    } else {
      item.onClick?.();
      if (item.value !== undefined) {
        (props as DropdownSingleProps).onSelect?.(item.value);
      }
      setOpen(false);
      setSearchQuery("");
    }
  };

  const handleTriggerClick = () => {
    if (isMulti) {
      const onDown = (e: MouseEvent) => {
        const t = e.target as Node;
        if (ref.current?.contains(t) || menuRef.current?.contains(t)) return;
        setOpen(false);
        setSearchQuery("");
        document.removeEventListener("mousedown", onDown);
      };
      if (!open) document.addEventListener("mousedown", onDown);
    }
    setOpen((o) => !o);
  };

  return (
    <div ref={ref} className={`relative ${className}`}>
      <div onClick={handleTriggerClick}>{trigger}</div>
      {open &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            style={{
              position: "fixed",
              top: pos?.top ?? 0,
              left: pos?.left ?? 0,
              width: pos?.width ?? MENU_WIDTH,
              visibility: pos ? "visible" : "hidden",
            }}
            className="bg-surface rounded-[10px] border border-line shadow-xl z-[9999] overflow-hidden"
          >
            {search && (
              <div
                className="p-2 border-b border-line-soft"
                onClick={(e) => e.stopPropagation()}
              >
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
                      onClick={() => setSearchQuery("")}
                      className="absolute right-2 text-content-soft hover:text-content"
                    >
                      <Icon.X className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>
            )}

            {isMulti && multiValues.length > 0 && (
              <div className="px-3 py-1.5 border-b border-line-soft flex items-center justify-between">
                <span className="text-xs text-content-soft">
                  {multiValues.length} selected
                </span>
                <button
                  type="button"
                  onClick={() =>
                    (props as DropdownMultiProps).onSelectMulti?.([])
                  }
                  className="text-xs text-danger hover:underline"
                >
                  Clear all
                </button>
              </div>
            )}

            <div className="max-h-60 overflow-y-auto py-1">
              {hasVisibleItems ? (
                filteredItems.map((item, i) => {
                  if (item.divider) {
                    return (
                      <div key={i} className="my-1 border-t border-line-soft" />
                    );
                  }

                  const selected = isItemSelected(item);

                  return (
                    <button
                      key={i}
                      type="button"
                      role="menuitem"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleItemSelect(item);
                      }}
                      className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left hover:bg-surface-hover transition-colors ${
                        selected
                          ? "bg-primary/10 text-primary font-medium"
                          : item.danger
                            ? "text-danger"
                            : "text-content-secondary"
                      }`}
                    >
                      {isMulti && (
                        <span
                          className={`w-4 h-4 shrink-0 rounded border flex items-center justify-center transition-colors ${
                            selected
                              ? "bg-primary border-primary"
                              : "border-line bg-surface"
                          }`}
                        >
                          {selected && (
                            <Icon.Check className="w-2.5 h-2.5 text-white" />
                          )}
                        </span>
                      )}
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        {item.icon && !isMulti && (
                          <span className="w-4 h-4 shrink-0">{item.icon}</span>
                        )}
                        <span className="truncate">{item.label}</span>
                      </div>
                      {!isMulti && selected && (
                        <Icon.Check className="w-4 h-4 text-primary shrink-0" />
                      )}
                    </button>
                  );
                })
              ) : (
                <div className="px-3 py-4 text-xs text-center text-content-soft">
                  No options found
                </div>
              )}
            </div>

            {isMulti && (
              <div className="px-3 py-2 border-t border-line-soft flex justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    setSearchQuery("");
                  }}
                  className="text-xs font-medium text-primary hover:underline"
                >
                  Done
                </button>
              </div>
            )}
          </div>,
          document.body,
        )}
    </div>
  );
}
