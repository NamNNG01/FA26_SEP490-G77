import React, { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { useAuth } from '@/auth/authContext';
import { useTheme } from '@/theme/ThemeProvider';
import { ROUTES } from '@/app/routes';
import { Avatar } from '@/components/ui/Avatar';
import { Icon } from '@/assets/icons';

/**
 * UserDropdown
 *
 * Header user menu (top-right) with exactly three items:
 *   - Profile → navigate(ROUTES.profile) via React Router (route registry,
 *               no hardcoded path here).
 *   - Theme   → INSTANTLY toggles to the next registered theme via
 *               useTheme().toggleTheme() — cycles dynamically through all
 *               themes registered in ThemeProvider (no hardcoded names).
 *   - Logout  → calls the existing logout() from AuthContext (no duplicated
 *               logic); routing reacts to the state change.
 *
 * There is NO nested submenu anymore.
 *
 * Styling uses semantic theme tokens (text-foreground, text-muted-foreground,
 * bg-accent, hover:bg-accent, hover:text-accent-foreground) so every item
 * keeps sufficient contrast in BOTH light and dark mode — no fixed colors.
 *
 * A11y: pointer cursor, Escape/ArrowUp/ArrowDown support, outside-click and
 * route-change close, 150ms transitions, no page reload on theme change.
 */
export function UserDropdown() {
  const { user, logout } = useAuth();
  const { resolved, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();

  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on outside click (pointerdown covers touch + mouse).
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  // Close on Escape.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  // Close whenever the URL changes (selecting an item navigates away).
  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  // Arrow-key navigation between items.
  function onMenuKeyDown(e: React.KeyboardEvent) {
    const items = Array.from(
      menuRef.current?.querySelectorAll<HTMLButtonElement>('[data-menu-item]') ?? [],
    );
    const idx = items.findIndex((el) => el === document.activeElement);
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      items[idx + 1 >= items.length ? 0 : idx + 1]?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      items[idx - 1 < 0 ? items.length - 1 : idx - 1]?.focus();
    }
  }

  function handleProfile() {
    setOpen(false);
    navigate(ROUTES.profile);
  }

  function handleTheme() {
    toggleTheme(); // instant, no reload; dropdown stays open for more clicks
  }

  async function handleLogout() {
    setOpen(false);
    await logout();
  }

  if (!user) return null;

  const menuItemClass =
    'w-full flex items-center gap-2.5 px-3 py-2 text-[13.5px] text-left cursor-pointer rounded-[8px] text-foreground hover:bg-accent hover:text-accent-foreground transition-colors duration-150';

  return (
    <div ref={rootRef} className="relative">
      {/* Trigger: avatar + name/role + caret */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-2.5 rounded-[10px] px-1.5 py-1 cursor-pointer text-foreground hover:bg-accent hover:text-accent-foreground transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-primary/30"
      >
        <Avatar name={user.fullName} src={user.avatarUrl ?? undefined} size="sm" color="#2563EB" />
        <div className="hidden sm:block text-left">
          <p className="text-[13px] font-semibold leading-tight text-foreground">
            {user.fullName}
          </p>
          <p className="text-[11px] leading-tight text-muted-foreground">
            {user.role?.code}
          </p>
        </div>
        <Icon.ChevronDown
          className={`w-4 h-4 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {/* Dropdown panel */}
      {open && (
        <div
          ref={menuRef}
          role="menu"
          onKeyDown={onMenuKeyDown}
          className="absolute right-0 top-[calc(100%+8px)] w-56 bg-surface rounded-[12px] border border-line shadow-lg py-1.5 px-1 z-50"
        >
          {/* Profile */}
          <button
            type="button"
            role="menuitem"
            data-menu-item
            onClick={handleProfile}
            className={menuItemClass}
          >
            <Icon.User className="w-4 h-4 text-muted-foreground" />
            Profile
          </button>

          {/* Theme — instant cycle through registered themes */}
          <button
            type="button"
            role="menuitem"
            data-menu-item
            onClick={handleTheme}
            className={menuItemClass}
          >
            <Icon.Star className="w-4 h-4 text-muted-foreground" />
            <span className="flex-1">Theme</span>
            <span className="text-[11px] capitalize text-muted-foreground">
              {resolved}
            </span>
          </button>

          <div className="my-1.5 border-t border-line" />

          {/* Logout */}
          <button
            type="button"
            role="menuitem"
            data-menu-item
            onClick={handleLogout}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-[13.5px] text-left cursor-pointer rounded-[8px] text-danger hover:bg-danger/10 hover:text-danger transition-colors duration-150"
          >
            <Icon.LogOut className="w-4 h-4" />
            Logout
          </button>
        </div>
      )}
    </div>
  );
}
