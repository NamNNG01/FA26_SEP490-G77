import { useCallback, useEffect, useRef, useState } from 'react';
import { useAutoRefresh } from '@/hooks/useAutoRefresh';
import { useNavigate } from 'react-router';
import { Badge, type BadgeVariant } from '@/components/ui/Badge';
import { Select } from '@/components/ui/Select';
import { Table, type TableColumn } from '@/components/ui/Table';
import { Dropdown } from '@/components/ui/Dropdown';
import { Avatar } from '@/components/ui/Avatar';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { SearchInput } from '@/components/common/SearchInput';
import { DashboardError } from '@/components/common/DashboardState';
import { Icon } from '@/assets/icons';
import { useToast } from '@/components/ui/ToastHost';
import { getApiErrorMessage } from '@/utils/apiError';
import { ROUTES } from '@/app/routes';
import { adminUserService, type AdminUserItem, type AdminUserListStats } from '@/services/adminUser.service';
import { getUserListState, type UserListState } from '../userListState';
import { AddUserModal } from '../components/AddUserModal';
import { SubscriptionCell } from '../components/SubscriptionCell';

/** Matches Table's DEFAULT_PAGE_SIZE — the list is paginated on the server. */
const PAGE_SIZE = 10;
/** Search runs on the server: wait for a typing pause instead of one call per keystroke. */
const SEARCH_DEBOUNCE_MS = 300;

const ROLE_LABELS: Record<string, string> = { STUDENT: 'Student', COURSE_MANAGER: 'Content Manager', ADMIN: 'Admin' };
const roleLabel = (role: string) => ROLE_LABELS[role] ?? role;
const roleBadgeVariant = (role: string): BadgeVariant => (role === 'ADMIN' ? 'danger' : role === 'COURSE_MANAGER' ? 'purple' : 'info');
const statusLabel = (status: string) => (status === 'ACTIVE' ? 'Active' : status === 'INACTIVE' ? 'Inactive' : status);

/** "Nov 16, 2026, 2:05 PM", or null when the account has never logged in. */
function formatLastLogin(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

/** Table-shaped skeleton shown while the first page of the list loads. */
function UsersTableSkeleton() {
  return (
    <div className="divide-y divide-line-faint" aria-hidden="true">
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="flex items-center gap-4 px-4 py-3">
          <Skeleton className="w-7 h-7 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-3 w-1/4" />
          </div>
          <Skeleton className="h-5 w-16 rounded-full" />
          <Skeleton className="h-5 w-20 rounded-full" />
        </div>
      ))}
    </div>
  );
}

export function UsersPage({ onNavigate }: { onNavigate?: (id: string, params?: Record<string, string>) => void }) {
  const navigate = useNavigate();
  const toast = useToast();
  // Filters, search and page persist in a module singleton so "Back to User
  // List" from User Detail restores the exact previous view.
  const saved = getUserListState();
  const [search, setSearch] = useState(saved.search);
  const [debouncedSearch, setDebouncedSearch] = useState(saved.search);
  const [role, setRole] = useState(saved.role);
  const [status, setStatus] = useState(saved.status);
  const [pageIndex, setPageIndex] = useState(saved.page);
  const [rows, setRows] = useState<AdminUserItem[]>([]);
  const [stats, setStats] = useState<AdminUserListStats | null>(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /** User whose row action (reset password / status change) is running. */
  const [workingId, setWorkingId] = useState<number | null>(null);
  /** User awaiting the reset-password confirmation. */
  const [resetTarget, setResetTarget] = useState<AdminUserItem | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  // Latest-wins: a slow response never overwrites a newer one.
  const requestRef = useRef(0);
  const appliedSearch = useRef(saved.search);

  const pushState = (patch: Partial<UserListState>) => {
    Object.assign(saved, patch);
  };

  // Debounce the search box; the applied term then drives the server query.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const value = search.trim();
      if (appliedSearch.current === value) return;
      appliedSearch.current = value;
      setDebouncedSearch(value);
      setPageIndex(1);
      pushState({ search: value, page: 1 });
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [search, saved]);

  /** `'quiet'` = shared auto-refresh: no loader, and a failure keeps the list on screen. */
  const load = useCallback(async (mode?: 'quiet') => {
    const quiet = mode === 'quiet';
    const requestId = ++requestRef.current;
    if (!quiet) setLoading(true);
    try {
      const result = await adminUserService.list({
        search: debouncedSearch || undefined,
        role: role === 'all' ? undefined : role,
        status: status === 'all' ? undefined : status,
        page: pageIndex - 1,
        size: PAGE_SIZE,
      });
      if (requestId !== requestRef.current) return;
      // The current page can disappear after a status change — fall back to the last real page.
      if (pageIndex > 1 && result.content.length === 0 && result.totalPages > 0 && pageIndex > result.totalPages) {
        setPageIndex(result.totalPages);
        pushState({ page: result.totalPages });
        return;
      }
      setRows(result.content);
      setStats(result.stats);
      setTotal(result.totalElements);
      setError(null);
    } catch (err) {
      if (requestId !== requestRef.current || quiet) return;
      setError(getApiErrorMessage(err, 'Could not load users.'));
    } finally {
      if (requestId === requestRef.current) setLoading(false);
    }
  }, [debouncedSearch, pageIndex, role, saved, status]);

  useEffect(() => {
    void load();
  }, [load]);
  useAutoRefresh(() => void load('quiet'));

  const openDetail = (item: AdminUserItem) => {
    if (onNavigate) onNavigate('user-detail', { userId: String(item.userId) });
    else navigate(`${ROUTES.adminUsers}/${item.userId}`);
  };

  const resetPassword = async (item: AdminUserItem) => {
    setWorkingId(item.userId);
    try {
      await adminUserService.resetPassword(item.userId);
      toast.success(`Password reset email sent to ${item.email}.`);
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Could not send the password reset email.'));
    } finally {
      setWorkingId(null);
      setResetTarget(null);
    }
  };

  const toggleStatus = async (item: AdminUserItem) => {
    const next = item.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    setWorkingId(item.userId);
    try {
      await adminUserService.setStatus(item.userId, next);
      toast.success(next === 'ACTIVE' ? `${item.fullName} activated.` : `${item.fullName} deactivated.`);
      await load();
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Could not change this user’s status.'));
    } finally {
      setWorkingId(null);
    }
  };

  const statCards: { label: string; value: number | null; color: string }[] = [
    { label: 'Total Users', value: stats?.total ?? null, color: '#F27124' },
    { label: 'Active', value: stats?.active ?? null, color: '#16A34A' },
    { label: 'Inactive', value: stats?.inactive ?? null, color: '#9CA3AF' },
    { label: 'New this month', value: stats?.newThisMonth ?? null, color: '#D97706' },
  ];

  const filtersActive = search.trim() !== '' || role !== 'all' || status !== 'all';

  const columns: TableColumn[] = [
    { key: 'name', label: 'User', render: (row: Record<string, unknown>) => {
      const item = row as unknown as AdminUserItem;
      return (
        // The whole row opens the detail; this button keeps it reachable by keyboard.
        <button onClick={e => { e.stopPropagation(); openDetail(item); }} className="flex items-center gap-2.5 text-left rounded-[6px] -ml-1 pl-1 pr-2 py-0.5 hover:bg-accent transition-colors min-w-0">
          <Avatar name={item.fullName} src={item.avatarUrl ?? undefined} size="sm" />
          <div className="min-w-0">
            <p className="font-medium text-content text-sm truncate hover:text-brand-ink transition-colors">{item.fullName}</p>
            <p className="text-2xs text-content-subtle truncate">{item.email}</p>
          </div>
        </button>
      );
    }},
    { key: 'role', label: 'Role', render: (row: Record<string, unknown>) => (
      <Badge variant={roleBadgeVariant(String(row.role))}>{roleLabel(String(row.role))}</Badge>
    )},
    { key: 'status', label: 'Status', render: (row: Record<string, unknown>) => (
      <Badge variant={row.status === 'ACTIVE' ? 'success' : 'default'}>{statusLabel(String(row.status))}</Badge>
    )},
    { key: 'lastLoginAt', label: 'Last Login', render: (row: Record<string, unknown>) => {
      const value = formatLastLogin(row.lastLoginAt as string | null);
      return value ? <span className="text-sm text-content-soft">{value}</span> : <span className="text-content-faint">—</span>;
    }},
    { key: 'subscription', label: 'Subscription', render: (row: Record<string, unknown>) => {
      const item = row as unknown as AdminUserItem;
      return <SubscriptionCell role={item.role} subscription={item.subscription} />;
    }},
    { key: 'actions', label: '', render: (row: Record<string, unknown>) => {
      const item = row as unknown as AdminUserItem;
      const busy = workingId === item.userId;
      // Menu clicks must not bubble up to the row and open the detail as well.
      return (
        <div onClick={e => e.stopPropagation()}>
          <Dropdown trigger={<button className="p-1.5 hover:bg-accent rounded-[6px]" aria-label={`Actions for ${item.fullName}`}><Icon.MoreHorizontal className="w-4 h-4 text-content-soft"/></button>}
            items={[
              { label: 'View', icon: <Icon.Eye className="w-4 h-4" />, onClick: () => openDetail(item) },
              { divider: true } as {label: string; divider: true},
              { label: 'Reset Password', icon: <Icon.Lock className="w-4 h-4" />, disabled: busy, onClick: () => setResetTarget(item) },
              item.status === 'ACTIVE'
                ? { label: 'Deactivate', icon: <Icon.X className="w-4 h-4" />, danger: true, disabled: busy, onClick: () => void toggleStatus(item) }
                : { label: 'Activate', icon: <Icon.CheckCircle className="w-4 h-4" />, disabled: busy, onClick: () => void toggleStatus(item) },
            ]} />
        </div>
      );
    }},
  ];

  return (
    <div className="p-8 space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-content">User Management</h2>
          <p className="text-sm text-content-soft mt-0.5">Manage accounts, roles, status and subscriptions.</p>
        </div>
        <Button icon={<Icon.Plus className="w-4 h-4" />} onClick={() => setAddOpen(true)}>Add User</Button>
      </div>
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        {statCards.map(s => (
          <div key={s.label} className="card p-4 flex items-center gap-3">
            <div className="w-2 h-10 rounded-full flex-shrink-0" style={{ background: s.color }} />
            <div className="min-w-0">
              {s.value === null
                ? error
                  ? <p className="text-xl font-bold text-content-faint">—</p>
                  : <Skeleton className="h-6 w-16" />
                : <p className="text-xl font-bold text-content">{s.value.toLocaleString()}</p>}
              <p className="text-xs text-content-subtle">{s.label}</p>
            </div>
          </div>
        ))}
      </div>
      <div className="card overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-line-soft">
          <SearchInput className="w-full sm:w-64" placeholder="Search users…" value={search} onChange={e => setSearch(e.target.value)} />
          <Select value={role} onChange={v => { setRole(v); setPageIndex(1); pushState({ role: v, page: 1 }); }} options={[{ label: 'All Roles', value: 'all' }, { label: 'Student', value: 'STUDENT' }, { label: 'Content Manager', value: 'COURSE_MANAGER' }, { label: 'Admin', value: 'ADMIN' }]} className="w-full sm:w-40" />
          <Select value={status} onChange={v => { setStatus(v); setPageIndex(1); pushState({ status: v, page: 1 }); }} options={[{ label: 'All Status', value: 'all' }, { label: 'Active', value: 'ACTIVE' }, { label: 'Inactive', value: 'INACTIVE' }]} className="w-full sm:w-32" />
        </div>
        {error ? (
          <DashboardError bare message={error} onRetry={() => void load()} />
        ) : loading && rows.length === 0 ? (
          <UsersTableSkeleton />
        ) : (
          <div className={`transition-opacity ${loading ? 'opacity-60' : ''}`} aria-busy={loading}>
            <Table
              columns={columns}
              data={rows.map(item => ({ ...item, id: item.userId })) as unknown as Record<string, unknown>[]}
              perPage={PAGE_SIZE}
              unit="users"
              onRowClick={row => openDetail(row as unknown as AdminUserItem)}
              serverPagination={{ page: pageIndex, total, onChange: p => { setPageIndex(p); pushState({ page: p }); } }}
              emptyState={filtersActive ? 'No users match your filters.' : 'No users yet.'}
            />
          </div>
        )}
      </div>

      <ConfirmDialog
        open={resetTarget != null}
        onClose={() => { if (workingId == null) setResetTarget(null); }}
        onConfirm={() => { if (resetTarget) void resetPassword(resetTarget); }}
        title="Reset password?"
        description={<>A password reset email will be sent to <span className="font-medium text-content">{resetTarget?.email}</span>.</>}
        confirmLabel="Send reset email"
        loading={resetTarget != null && workingId === resetTarget.userId}
      />

      <AddUserModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onCreated={user => {
          setAddOpen(false);
          toast.success(`${user.fullName} was created. Sign-in details were sent to ${user.email}.`);
          void load();
        }}
      />
    </div>
  );
}
