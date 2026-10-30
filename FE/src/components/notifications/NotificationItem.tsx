import React from 'react';
import { Icon } from '@/assets/icons';
import type { StudentNotification } from '@/services/studentNotification.service';

/** Icon per NT-01 `type`; unknown types fall back to the bell. */
function typeIcon(type: string | null): React.ReactNode {
  const cls = 'w-4 h-4';
  switch (type) {
    case 'EXAM_REMINDER':
      return <Icon.Clock className={cls} />;
    case 'GRADING_COMPLETED':
      return <Icon.CheckCircle className={cls} />;
    case 'CONTEST_REWARD':
      return <Icon.Trophy className={cls} />;
    case 'CONTEST_CANCELLED':
      return <Icon.XCircle className={cls} />;
    default:
      return <Icon.Bell className={cls} />;
  }
}

/** "Just now", "5m ago", "3h ago", "2d ago", then the date. */
export function formatRelativeTime(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return iso;
  const s = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (s < 60) return 'Just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86_400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 7 * 86_400) return `${Math.floor(s / 86_400)}d ago`;
  return new Date(t).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

/** In-app path for the notification, or null when it only informs (clicking just marks it read). */
export function notificationTarget(n: StudentNotification): string | null {
  return n.link && n.link.startsWith('/') ? n.link : null;
}

/**
 * One inbox row, shared by the header bell and the Notifications page.
 * Unread rows are bold with a brand dot.
 */
export function NotificationItem({
  notification: n,
  onClick,
  compact = false,
}: {
  notification: StudentNotification;
  onClick: (n: StudentNotification) => void;
  compact?: boolean;
}) {
  return (
    <button
      type="button"
      data-menu-item
      onClick={() => onClick(n)}
      className={`w-full flex items-start gap-3 text-left cursor-pointer transition-colors duration-150 hover:bg-accent ${
        compact ? 'px-3 py-2.5 rounded-[8px]' : 'px-5 py-4'
      } ${n.isRead ? '' : 'bg-primary-light/40'}`}
    >
      <span
        className={`mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full ${
          n.isRead ? 'bg-surface-muted text-content-subtle' : 'bg-primary-light text-brand-ink'
        }`}
        aria-hidden="true"
      >
        {typeIcon(n.type)}
      </span>
      <span className="min-w-0 flex-1">
        <span className={`block text-sm leading-snug ${n.isRead ? 'font-normal text-content-secondary' : 'font-semibold text-content'}`}>
          {n.title}
        </span>
        {n.body && (
          <span className={`mt-0.5 block text-sm text-content-soft ${compact ? 'line-clamp-2' : ''} ${n.isRead ? '' : 'font-medium'}`}>
            {n.body}
          </span>
        )}
        <span className="mt-1 block text-xs text-content-subtle">{formatRelativeTime(n.createdAt)}</span>
      </span>
      {!n.isRead && (
        <span className="mt-2 h-2 w-2 flex-shrink-0 rounded-full bg-primary" aria-label="Unread" />
      )}
    </button>
  );
}
