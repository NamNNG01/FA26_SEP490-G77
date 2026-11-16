import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { isAxiosError } from 'axios';
import { Badge, type BadgeVariant } from '@/components/ui/Badge';
import { Avatar } from '@/components/ui/Avatar';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { Button } from '@/components/ui/Button';
import { Table, type TableColumn } from '@/components/ui/Table';
import { Modal } from '@/components/ui/Modal';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Skeleton } from '@/components/ui/Skeleton';
import { DashboardError } from '@/components/common/DashboardState';
import { Icon } from '@/assets/icons';
import { useToast } from '@/components/ui/ToastHost';
import { getApiErrorMessage } from '@/utils/apiError';
import { ROUTES } from '@/app/routes';
import {
  adminUserService,
  type AdminUserDetail,
  type AdminUserRole,
  type AdminUserStatus,
} from '@/services/adminUser.service';

const ROLE_LABELS: Record<string, string> = { STUDENT: 'Student', COURSE_MANAGER: 'Content Manager', ADMIN: 'Admin' };
const roleLabel = (role: string) => ROLE_LABELS[role] ?? role;
const roleBadgeVariant = (role: string): BadgeVariant => (role === 'ADMIN' ? 'danger' : role === 'COURSE_MANAGER' ? 'purple' : 'info');
const statusLabel = (status: string) => (status === 'ACTIVE' ? 'Active' : status === 'INACTIVE' ? 'Inactive' : status);

const ATTEMPT_STATUS_LABELS: Record<string, string> = {
  IN_PROGRESS: 'In progress',
  SUBMITTED: 'Submitted',
  GRADING: 'Grading',
  COMPLETED: 'Completed',
  PASSED: 'Passed',
  FAILED: 'Failed',
};
const attemptStatusLabel = (status: string) => ATTEMPT_STATUS_LABELS[status] ?? status;
const attemptStatusVariant = (status: string): BadgeVariant =>
  status === 'COMPLETED' || status === 'PASSED' ? 'success'
    : status === 'FAILED' ? 'danger'
      : status === 'GRADING' ? 'warning'
        : status === 'SUBMITTED' ? 'info' : 'default';

/** "Nov 16, 2026, 2:05 PM", or null when the value is missing. */
function formatDateTime(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

/** Score of an attempt, e.g. 7.5; null when the attempt has no score yet. */
function scoreLabel(score: number | null): string | null {
  return score == null ? null : String(Number(score));
}

type EditForm = { fullName: string; email: string; role: AdminUserRole; status: AdminUserStatus };

/** Skeleton of the detail layout shown while the profile loads. */
function UserDetailSkeleton() {
  return (
    <div className="p-8 space-y-5" aria-busy="true">
      <Skeleton className="h-4 w-40" />
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 items-start">
        <div className="lg:col-span-3 space-y-5 min-w-0">
          <div className="card p-6 space-y-4">
            <div className="flex items-center gap-4">
              <Skeleton className="w-14 h-14 rounded-full" />
              <div className="space-y-2">
                <Skeleton className="h-5 w-44" />
                <Skeleton className="h-3 w-56" />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-x-6 gap-y-4 pt-2">
              {Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-8 w-full" />)}
            </div>
          </div>
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
            {Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-20 rounded-[10px]" />)}
          </div>
          <div className="card p-6 space-y-3">
            <Skeleton className="h-5 w-52" />
            {Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-10 w-full" />)}
          </div>
        </div>
        <div className="lg:col-span-1 space-y-4 min-w-0">
          <Skeleton className="h-44 rounded-[14px]" />
          <Skeleton className="h-52 rounded-[14px]" />
        </div>
      </div>
    </div>
  );
}

export function UserDetailPage({ onNavigate, params: paramsProp }: { onNavigate?: (id: string, params?: Record<string, string>) => void; params?: Record<string, string> }) {
  // Support both direct props and the :userId route param.
  const routeParams = useParams();
  const params = paramsProp ?? (routeParams as Record<string, string>);
  const navigate = useNavigate();
  const toast = useToast();
  // An unusable :userId is treated as "not found" — never fall back to another user.
  const rawUserId = params?.userId;
  const userId = rawUserId != null && /^\d+$/.test(rawUserId) ? Number(rawUserId) : null;

  const [user, setUser] = useState<AdminUserDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [form, setForm] = useState<EditForm>({ fullName: '', email: '', role: 'STUDENT', status: 'ACTIVE' });
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const [changingStatus, setChangingStatus] = useState(false);

  // Only ever render the profile that belongs to the id in the URL.
  const profile = user != null && userId != null && user.userId === userId ? user : null;

  const load = useCallback(async () => {
    if (userId == null) {
      setUser(null);
      setError(null);
      setNotFound(true);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    setNotFound(false);
    try {
      setUser(await adminUserService.get(userId));
    } catch (err) {
      setUser(null);
      if (isAxiosError(err) && err.response?.status === 404) setNotFound(true);
      else setError(getApiErrorMessage(err, 'Could not load this user.'));
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  const backToUsers = () => {
    if (onNavigate) onNavigate('users');
    else navigate(ROUTES.adminUsers);
  };

  const openEdit = () => {
    if (!profile) return;
    setForm({ fullName: profile.fullName, email: profile.email, role: profile.role, status: profile.status });
    setEditOpen(true);
  };

  const saveEdit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!profile) return;
    const fullName = form.fullName.trim();
    const email = form.email.trim();
    if (!fullName || !email) {
      toast.error('Full name and email are required.');
      return;
    }
    setSaving(true);
    try {
      await adminUserService.update(profile.userId, { fullName, email, role: form.role, status: form.status });
      toast.success('User updated.');
      setEditOpen(false);
      await load();
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Could not update this user.'));
    } finally {
      setSaving(false);
    }
  };

  const resetPassword = async () => {
    if (!profile) return;
    setResetting(true);
    try {
      await adminUserService.resetPassword(profile.userId);
      toast.success(`Password reset email sent to ${profile.email}.`);
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Could not send the password reset email.'));
    } finally {
      setResetting(false);
      setResetConfirmOpen(false);
    }
  };

  const toggleStatus = async () => {
    if (!profile) return;
    const next: AdminUserStatus = profile.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    setChangingStatus(true);
    try {
      await adminUserService.setStatus(profile.userId, next);
      toast.success(next === 'ACTIVE' ? 'User activated.' : 'User deactivated.');
      await load();
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Could not change this user’s status.'));
    } finally {
      setChangingStatus(false);
    }
  };

  if (loading && !profile) return <UserDetailSkeleton />;

  if (notFound) {
    return (
      <div className="p-8">
        <div className="card p-10 flex flex-col items-center text-center max-w-md mx-auto">
          <div className="w-20 h-20 bg-surface-muted rounded-[20px] flex items-center justify-center mb-5">
            <Icon.User className="w-10 h-10 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-semibold text-content mb-1.5">User not found</h3>
          <p className="text-sm text-content-soft mb-6">No account matches this link. It may have been removed, or the address may be wrong.</p>
          <Button variant="outline" icon={<Icon.ChevronLeft className="w-4 h-4" />} onClick={backToUsers}>
            Back to User List
          </Button>
        </div>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="p-8">
        <div className="card overflow-hidden">
          <DashboardError bare message={error ?? 'Could not load this user.'} onRetry={() => void load()} />
        </div>
        <div className="mt-4 flex justify-center">
          <Button variant="ghost" icon={<Icon.ChevronLeft className="w-4 h-4" />} onClick={backToUsers}>
            Back to User List
          </Button>
        </div>
      </div>
    );
  }

  // Learning stats and exam attempts only exist for students.
  const isStudent = profile.role === 'STUDENT';
  const attemptRows = profile.recentAttempts.map(attempt => ({ ...attempt, id: attempt.attemptId }));
  const attemptColumns: TableColumn[] = [
    { key: 'examTitle', label: 'Exam Name', render: (row: Record<string, unknown>) => (
      <span className="font-medium text-content text-sm">{row.examTitle as string}</span>
    )},
    // The attempt score is raw points (the API carries no maxScore), so it is labelled as such —
    // never as a percentage. The student result screen is student-only, so no "View Result" link
    // is offered here: it could only bounce an admin away.
    { key: 'score', label: 'Score (pts)', render: (row: Record<string, unknown>) => {
      const value = scoreLabel(row.score as number | null);
      return value == null
        ? <span className="text-content-faint">—</span>
        : <span className="font-semibold text-content-secondary tabular-nums">{value}</span>;
    }},
    { key: 'status', label: 'Status', render: (row: Record<string, unknown>) => (
      <Badge variant={attemptStatusVariant(String(row.status))}>{attemptStatusLabel(String(row.status))}</Badge>
    )},
    { key: 'submittedAt', label: 'Submitted', render: (row: Record<string, unknown>) => (
      <span className="text-sm text-content-soft">{formatDateTime(row.submittedAt as string | null) ?? '—'}</span>
    )},
  ];

  const statCards: { label: string; value: string; color: string; small?: boolean }[] = [
    { label: 'Total Courses Enrolled', value: String(profile.stats.coursesEnrolled), color: '#F27124' },
    { label: 'Exams Taken', value: String(profile.stats.examsTaken), color: '#059669' },
    // Average of the attempts' raw total scores — there is no max score in this payload, so a
    // percentage would be invented. Show the points and say so.
    { label: 'Average Score (pts)', value: profile.stats.averageScore == null ? '—' : String(Number(profile.stats.averageScore)), color: '#7C3AED' },
    { label: 'Last Activity', value: formatDateTime(profile.stats.lastActivityAt) ?? '—', color: '#0891B2', small: true },
  ];

  return (
    <div className="p-8 space-y-5">
      <Breadcrumb items={[{ label: 'User List', onClick: backToUsers }, { label: profile.fullName }]} />

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 items-start">
        {/* Left (75%): profile, learning stats, recent exam attempts */}
        <div className="lg:col-span-3 space-y-5 min-w-0">
          {/* User Profile card */}
          <div className="card p-6">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-4 min-w-0">
                <Avatar name={profile.fullName} src={profile.avatarUrl ?? undefined} size="xl" />
                <div className="min-w-0">
                  <h2 className="text-xl font-bold text-content truncate">{profile.fullName}</h2>
                  <p className="text-sm text-content-soft truncate">{profile.email}</p>
                </div>
              </div>
              <span className="text-xs text-content-subtle flex items-center gap-1.5 flex-shrink-0">
                <Icon.Clock className="w-3.5 h-3.5" />Last login {formatDateTime(profile.lastLoginAt) ?? '—'}
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-x-6 gap-y-4 mt-5">
              {[
                { label: 'Full Name', value: profile.fullName },
                { label: 'Email', value: profile.email },
                { label: 'Role', value: roleLabel(profile.role) },
                { label: 'Status', value: statusLabel(profile.status) },
                { label: 'Date Joined', value: formatDateTime(profile.createdAt) ?? '—' },
                { label: 'Last Login', value: formatDateTime(profile.lastLoginAt) ?? '—' },
              ].map(f => (
                <div key={f.label} className="min-w-0">
                  <p className="text-xs text-content-subtle">{f.label}</p>
                  <p className="text-sm font-medium text-content mt-0.5 break-words">{f.value}</p>
                </div>
              ))}
            </div>
          </div>

          {isStudent && <>
          {/* Learning Statistics */}
          <div>
            <h3 className="text-lg font-semibold text-content mb-3">Learning Statistics</h3>
            <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
              {statCards.map(s => (
                <div key={s.label} className="bg-surface-alt rounded-[10px] p-4">
                  <p className={s.small ? 'text-base font-semibold break-words' : 'text-xl font-bold'} style={{ color: s.color }}>{s.value}</p>
                  <p className="text-xs text-content-subtle mt-0.5">{s.label}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Recent Exam Attempts */}
          <div className="card overflow-hidden">
            <div className="px-5 py-4 border-b border-line-soft">
              <h4 className="text-lg font-semibold text-content">Recent Exam Attempts</h4>
              <p className="text-xs text-content-subtle mt-0.5">Latest 5 attempts across all enrolled courses</p>
            </div>
            <Table
              columns={attemptColumns}
              data={attemptRows as unknown as Record<string, unknown>[]}
              perPage={5}
              unit="attempts"
              emptyState="No exam attempts yet."
            />
          </div>
          </>}
        </div>

        {/* Right (25%): sticky sidebar */}
        <div className="lg:col-span-1 lg:sticky lg:top-0 space-y-4 min-w-0">
          {/* Compact summary card */}
          <div className="card p-5 text-center">
            <div className="flex justify-center">
              <Avatar name={profile.fullName} src={profile.avatarUrl ?? undefined} size="xl" />
            </div>
            <h4 className="text-lg font-semibold text-content mt-3 truncate">{profile.fullName}</h4>
            <p className="text-xs text-content-subtle font-mono">User ID: {profile.userId}</p>
            <div className="flex items-center justify-center gap-2 mt-3">
              <Badge variant={roleBadgeVariant(profile.role)}>{roleLabel(profile.role)}</Badge>
              <Badge variant={profile.status === 'ACTIVE' ? 'success' : 'default'}>{statusLabel(profile.status)}</Badge>
            </div>
          </div>

          {/* Actions card */}
          <div className="card p-5 space-y-2">
            <h4 className="text-base font-semibold text-content mb-1">Actions</h4>
            <Button icon={<Icon.Edit className="w-4 h-4" />} className="w-full justify-center" onClick={openEdit}>Edit User</Button>
            <Button variant="outline" icon={<Icon.Lock className="w-4 h-4" />} className="w-full justify-center" disabled={resetting} onClick={() => setResetConfirmOpen(true)}>Reset Password</Button>
            <Button
              variant={profile.status === 'ACTIVE' ? 'outline' : 'primary'}
              icon={profile.status === 'ACTIVE' ? <Icon.EyeOff className="w-4 h-4" /> : <Icon.CheckCircle className="w-4 h-4" />}
              className="w-full justify-center"
              loading={changingStatus}
              disabled={changingStatus}
              onClick={() => void toggleStatus()}
            >
              {profile.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
            </Button>
          </div>

          <Button variant="ghost" icon={<Icon.ChevronLeft className="w-4 h-4" />} className="w-full justify-center" onClick={backToUsers}>
            Back to User List
          </Button>
        </div>
      </div>

      <Modal open={editOpen} onClose={() => setEditOpen(false)} title="Edit User">
        <form onSubmit={saveEdit} className="space-y-4">
          <Input label="Full Name" required maxLength={100} value={form.fullName} onChange={e => setForm(prev => ({ ...prev, fullName: e.target.value }))} />
          <Input label="Email" type="email" required maxLength={150} value={form.email} onChange={e => setForm(prev => ({ ...prev, email: e.target.value }))} />
          <Select
            label="Role"
            value={form.role}
            onChange={v => setForm(prev => ({ ...prev, role: v as AdminUserRole }))}
            options={[{ label: 'Student', value: 'STUDENT' }, { label: 'Content Manager', value: 'COURSE_MANAGER' }, { label: 'Admin', value: 'ADMIN' }]}
          />
          <Select
            label="Status"
            value={form.status}
            onChange={v => setForm(prev => ({ ...prev, status: v as AdminUserStatus }))}
            options={[{ label: 'Active', value: 'ACTIVE' }, { label: 'Inactive', value: 'INACTIVE' }]}
          />
          <div className="flex justify-end gap-2 pt-4 border-t border-line-soft">
            <Button type="button" variant="outline" onClick={() => setEditOpen(false)} disabled={saving}>Cancel</Button>
            <Button type="submit" variant="primary" loading={saving} disabled={saving}>Save Changes</Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={resetConfirmOpen}
        onClose={() => setResetConfirmOpen(false)}
        onConfirm={() => void resetPassword()}
        title="Reset password?"
        description={<>A password reset email will be sent to <span className="font-medium text-content">{profile.email}</span>.</>}
        confirmLabel="Send reset email"
        loading={resetting}
      />
    </div>
  );
}
