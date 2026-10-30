import { useEffect, useSyncExternalStore } from 'react';
import { api } from './api';
import type { ApiResponse } from '@/auth/authContext';
import type { PageResponse } from './course.service';

/**
 * StudentNotificationService — inbox (spec §23, StudentNotificationController).
 *
 *   GET  /api/v1/student/notifications?unreadOnly=&page=&size=   (NT-01) — newest first
 *   POST /api/v1/student/notifications/{notificationId}/read     (NT-02) — idempotent
 *   POST /api/v1/student/notifications/read-all                  (NT-03)
 *
 * Channel: REST + a 30 s poll of `unreadCount` (spec §24.2) — no push.
 *
 * Errors: NT-02 404 when the notification does not exist or is not the student's.
 */

/** NT-01 item */
export interface StudentNotification {
  notificationId: number;
  title: string;
  body: string | null;
  /** EXAM_REMINDER, GRADING_COMPLETED, CONTEST_REWARD, CONTEST_CANCELLED, … */
  type: string | null;
  /** In-app path to open on click; null when the notification only informs. */
  link: string | null;
  isRead: boolean;
  createdAt: string;
}

/** NT-01 */
export interface NotificationInbox extends PageResponse<StudentNotification> {
  unreadCount: number;
}

export interface NotificationListParams {
  unreadOnly?: boolean;
  page?: number;
  size?: number;
}

export const studentNotificationService = {
  async list({ unreadOnly = false, page = 0, size = 20 }: NotificationListParams = {}): Promise<NotificationInbox> {
    const qs = new URLSearchParams({ unreadOnly: String(unreadOnly), page: String(page), size: String(size) });
    const res = await api.get<ApiResponse<NotificationInbox>>(`/student/notifications?${qs}`);
    return res.data;
  },

  async markRead(notificationId: number): Promise<{ notificationId: number; isRead: boolean; unreadCount: number }> {
    const res = await api.post<ApiResponse<{ notificationId: number; isRead: boolean; unreadCount: number }>>(
      `/student/notifications/${notificationId}/read`,
    );
    return res.data;
  },

  async markAllRead(): Promise<{ markedCount: number; unreadCount: number }> {
    const res = await api.post<ApiResponse<{ markedCount: number; unreadCount: number }>>('/student/notifications/read-all');
    return res.data;
  },
};

/*
 * Unread count shared by every bell (dashboard header, public navbar desktop + mobile) and the
 * Notifications page. One poller runs while at least one reader is mounted; it pauses while the
 * tab is hidden and refreshes as soon as the tab is visible again.
 */
export const NOTIFICATION_POLL_MS = 30_000;

let unreadCount = 0;
/** Account the cached count belongs to — another sign-in starts over. */
let unreadOwner: number | null = null;
let readers = 0;
let timer: ReturnType<typeof setInterval> | null = null;
let inflight: Promise<void> | null = null;
const listeners = new Set<() => void>();

/** Called with every count the server reports (NT-01/02/03), so all readers agree. */
export function setUnreadCount(next: number) {
  if (next === unreadCount) return;
  unreadCount = next;
  listeners.forEach(l => l());
}

export function refreshUnreadCount(): Promise<void> {
  if (!inflight) {
    const owner = unreadOwner;
    const request: Promise<void> = studentNotificationService
      .list({ page: 0, size: 1 })
      .then(inbox => { if (owner === unreadOwner) setUnreadCount(inbox.unreadCount); })
      // A failed poll keeps the badge as it is; the next tick tries again.
      .catch(() => {})
      .finally(() => { if (inflight === request) inflight = null; });
    inflight = request;
  }
  return inflight;
}

/** NT-02 for an unread notification, then sync the shared count. Failures are dropped (the next poll corrects). */
export function markNotificationRead(n: StudentNotification): void {
  if (n.isRead) return;
  studentNotificationService
    .markRead(n.notificationId)
    .then(res => setUnreadCount(res.unreadCount))
    .catch(() => {});
}

function onVisibilityChange() {
  if (document.visibilityState === 'visible') void refreshUnreadCount();
}

function startPolling() {
  void refreshUnreadCount();
  timer = setInterval(() => {
    if (document.visibilityState === 'visible') void refreshUnreadCount();
  }, NOTIFICATION_POLL_MS);
  document.addEventListener('visibilitychange', onVisibilityChange);
}

function stopPolling() {
  if (timer) clearInterval(timer);
  timer = null;
  document.removeEventListener('visibilitychange', onVisibilityChange);
}

/** The signed-in student's unread count, kept fresh by the shared poller; `userId = null` for guests and other roles. */
export function useUnreadNotificationCount(userId: number | null): number {
  const count = useSyncExternalStore(
    cb => { listeners.add(cb); return () => { listeners.delete(cb); }; },
    () => unreadCount,
  );
  useEffect(() => {
    if (userId == null) return;
    if (userId !== unreadOwner) {
      unreadOwner = userId;
      inflight = null;
      setUnreadCount(0);
      if (readers > 0) void refreshUnreadCount();
    }
    if (readers++ === 0) startPolling();
    return () => {
      if (--readers === 0) stopPolling();
    };
  }, [userId]);
  return userId != null && userId === unreadOwner ? count : 0;
}
