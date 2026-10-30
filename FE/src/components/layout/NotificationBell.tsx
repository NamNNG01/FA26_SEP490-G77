import React, { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { useAuth } from '@/auth/authContext';
import { ROUTES } from '@/app/routes';
import { Icon } from '@/assets/icons';
import { Role } from '@/utils/permissions';
import { Skeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/ToastHost';
import { getApiErrorMessage } from '@/utils/apiError';
import { NotificationItem, notificationTarget } from '@/components/notifications/NotificationItem';
import {
  markNotificationRead,
  setUnreadCount,
  studentNotificationService,
  useUnreadNotificationCount,
  type StudentNotification,
} from '@/services/studentNotification.service';

/** Rows shown in the dropdown; the rest live on the Notifications page. */
const PREVIEW_SIZE = 10;

/**
 * NotificationBell — YouTube-style header bell, STUDENT only (renders nothing otherwise).
 *
 *   - Red badge with the unread count (NT-01 `unreadCount`, polled every 30 s by the shared store).
 *   - Opening fetches the newest PREVIEW_SIZE notifications; unread rows are bold.
 *   - Clicking a row marks it read (NT-02) and opens its `link`; a row without a link only gets marked.
 *   - "Mark all as read" (NT-03) and "See all" → /student/notifications.
 *
 * Closes on outside click, Escape and route change, like UserDropdown.
 */
export function NotificationBell() {
  const { user } = useAuth();
  const isStudent = user?.role === Role.STUDENT;
  const unread = useUnreadNotificationCount(isStudent ? user?.userId ?? null : null);
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();

  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<StudentNotification[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [markingAll, setMarkingAll] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  // Every open shows the latest list.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setError(null);
    studentNotificationService
      .list({ page: 0, size: PREVIEW_SIZE })
      .then(inbox => {
        if (cancelled) return;
        setItems(inbox.content);
        setUnreadCount(inbox.unreadCount);
      })
      .catch(err => { if (!cancelled) setError(getApiErrorMessage(err, 'Could not load notifications.')); });
    return () => { cancelled = true; };
  }, [open]);

  if (!isStudent) return null;

  function handleItem(n: StudentNotification) {
    markNotificationRead(n);
    setItems(prev => prev?.map(i => (i.notificationId === n.notificationId ? { ...i, isRead: true } : i)) ?? prev);
    const target = notificationTarget(n);
    if (target) {
      setOpen(false);
      navigate(target);
    }
  }

  async function handleMarkAll() {
    setMarkingAll(true);
    try {
      const res = await studentNotificationService.markAllRead();
      setUnreadCount(res.unreadCount);
      setItems(prev => prev?.map(i => ({ ...i, isRead: true })) ?? prev);
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Could not mark notifications as read.'));
    } finally {
      setMarkingAll(false);
    }
  }

  function onPanelKeyDown(e: React.KeyboardEvent) {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const rows = Array.from(panelRef.current?.querySelectorAll<HTMLButtonElement>('[data-menu-item]') ?? []);
    const idx = rows.findIndex(el => el === document.activeElement);
    const next = e.key === 'ArrowDown' ? (idx + 1) % rows.length : (idx - 1 + rows.length) % rows.length;
    rows[next]?.focus();
  }

  const badge = unread > 99 ? '99+' : String(unread);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="relative flex h-9 w-9 items-center justify-center rounded-[10px] cursor-pointer text-content-soft hover:bg-accent hover:text-foreground transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-primary/30"
      >
        <Icon.Bell className="w-5 h-5" />
        {unread > 0 && (
          <span
            aria-hidden="true"
            className="absolute -top-0.5 -right-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold leading-none text-white ring-2 ring-surface"
          >
            {badge}
          </span>
        )}
      </button>

      {open && (
        <div
          ref={panelRef}
          role="dialog"
          aria-label="Notifications"
          onKeyDown={onPanelKeyDown}
          className="absolute right-0 top-[calc(100%+8px)] w-[min(24rem,calc(100vw-1.5rem))] bg-surface rounded-[12px] border border-line shadow-lg z-50 flex flex-col max-h-[min(32rem,calc(100dvh-5rem))]"
        >
          <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-line">
            <p className="text-sm font-semibold text-content">Notifications</p>
            <button
              type="button"
              onClick={handleMarkAll}
              disabled={unread === 0 || markingAll}
              className="text-xs font-medium text-primary hover:underline cursor-pointer disabled:cursor-default disabled:text-content-subtle disabled:no-underline"
            >
              Mark all as read
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-1">
            {error ? (
              <p className="px-4 py-8 text-center text-sm text-content-soft">{error}</p>
            ) : items == null ? (
              <div className="space-y-1 p-2">
                {Array.from({ length: 3 }, (_, i) => (
                  <div key={i} className="flex gap-3 px-1 py-2">
                    <Skeleton className="h-8 w-8 rounded-full" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-3.5 w-3/4" />
                      <Skeleton className="h-3 w-1/2" />
                    </div>
                  </div>
                ))}
              </div>
            ) : items.length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
                <Icon.Bell className="w-7 h-7 text-content-subtle" />
                <p className="text-sm text-content-soft">You have no notifications yet.</p>
              </div>
            ) : (
              items.map(n => <NotificationItem key={n.notificationId} notification={n} onClick={handleItem} compact />)
            )}
          </div>

          <div className="border-t border-line p-1">
            <button
              type="button"
              data-menu-item
              onClick={() => { setOpen(false); navigate(ROUTES.studentNotifications); }}
              className="w-full rounded-[8px] px-3 py-2 text-center text-sm font-medium text-primary hover:bg-accent cursor-pointer transition-colors duration-150"
            >
              See all notifications
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
