import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { Button } from '@/components/ui/Button';
import { Pagination } from '@/components/ui/Pagination';
import { EmptyState } from '@/components/ui/Card';
import { Tabs } from '@/components/ui/Tabs';
import { useToast } from '@/components/ui/ToastHost';
import { Icon } from '@/assets/icons';
import { useAuth } from '@/auth/authContext';
import { getApiErrorMessage } from '@/utils/apiError';
import { NotificationItem, notificationTarget } from '@/components/notifications/NotificationItem';
import {
  markNotificationRead,
  setUnreadCount,
  studentNotificationService,
  useUnreadNotificationCount,
  type NotificationInbox,
  type StudentNotification,
} from '@/services/studentNotification.service';
import { ListSkeleton, LoadError, PageTitle, STUDENT_PAGE_CLASS } from '../components/studentUi';

const PAGE_SIZE = 20;
const TAB_ALL = 'All';
const TAB_UNREAD = 'Unread';

/**
 * Notifications — the full inbox behind the header bell's "See all" (NT-01..NT-03).
 *
 * `?filter=unread` maps to `unreadOnly=true`; `?page=` is 1-based in the URL, 0-based for the API.
 * Rows read here stay in the Unread tab (just no longer bold) until the next load, so the list
 * does not jump under the pointer.
 */
export function StudentNotificationsPage() {
  const { user } = useAuth();
  const unread = useUnreadNotificationCount(user?.userId ?? null);
  const navigate = useNavigate();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const unreadOnly = params.get('filter') === 'unread';
  const page = Math.max(1, Number(params.get('page')) || 1);

  const [inbox, setInbox] = useState<NotificationInbox | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [markingAll, setMarkingAll] = useState(false);

  const load = useCallback(() => {
    let cancelled = false;
    setInbox(null);
    setError(null);
    studentNotificationService
      .list({ unreadOnly, page: page - 1, size: PAGE_SIZE })
      .then(res => {
        if (cancelled) return;
        setInbox(res);
        setUnreadCount(res.unreadCount);
      })
      .catch(err => { if (!cancelled) setError(getApiErrorMessage(err, 'Could not load notifications.')); });
    return () => { cancelled = true; };
  }, [unreadOnly, page]);

  useEffect(() => load(), [load]);

  function update(next: { filter?: 'unread' | null; page?: number }) {
    const p = new URLSearchParams(params);
    if (next.filter !== undefined) {
      if (next.filter) p.set('filter', next.filter);
      else p.delete('filter');
      p.delete('page');
    }
    if (next.page !== undefined) {
      if (next.page > 1) p.set('page', String(next.page));
      else p.delete('page');
    }
    setParams(p);
  }

  function markLocal(pred: (n: StudentNotification) => boolean) {
    setInbox(prev => prev && { ...prev, content: prev.content.map(n => (pred(n) ? { ...n, isRead: true } : n)) });
  }

  function handleItem(n: StudentNotification) {
    markNotificationRead(n);
    markLocal(i => i.notificationId === n.notificationId);
    const target = notificationTarget(n);
    if (target) navigate(target);
  }

  async function handleMarkAll() {
    setMarkingAll(true);
    try {
      const res = await studentNotificationService.markAllRead();
      setUnreadCount(res.unreadCount);
      markLocal(() => true);
      toast.success(res.markedCount > 0 ? `Marked ${res.markedCount} as read.` : 'Everything is already read.');
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Could not mark notifications as read.'));
    } finally {
      setMarkingAll(false);
    }
  }

  return (
    <div className={`${STUDENT_PAGE_CLASS} space-y-5`}>
      <PageTitle
        title="Notifications"
        subtitle={unread > 0 ? `You have ${unread} unread notification${unread === 1 ? '' : 's'}.` : 'You are all caught up.'}
        action={
          <Button
            variant="outline"
            size="sm"
            icon={<Icon.Check className="w-4 h-4" />}
            onClick={handleMarkAll}
            disabled={unread === 0 || markingAll}
          >
            Mark all as read
          </Button>
        }
      />

      <Tabs
        variant="underline"
        tabs={[TAB_ALL, TAB_UNREAD]}
        active={unreadOnly ? TAB_UNREAD : TAB_ALL}
        onChange={t => update({ filter: t === TAB_UNREAD ? 'unread' : null })}
      />

      {error ? (
        <LoadError message={error} onRetry={load} />
      ) : inbox == null ? (
        <ListSkeleton rows={6} />
      ) : inbox.content.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={<Icon.Bell className="w-8 h-8" />}
            title={unreadOnly ? 'No unread notifications' : 'No notifications yet'}
            message={unreadOnly ? 'You have read everything.' : 'Exam reminders, grading results and contest news will show up here.'}
          />
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="divide-y divide-line">
            {inbox.content.map(n => (
              <NotificationItem key={n.notificationId} notification={n} onClick={handleItem} />
            ))}
          </div>
          <div className="border-t border-line">
            <Pagination
              page={page}
              total={inbox.totalElements}
              perPage={PAGE_SIZE}
              onChange={p => update({ page: p })}
              unit="notifications"
            />
          </div>
        </div>
      )}
    </div>
  );
}
