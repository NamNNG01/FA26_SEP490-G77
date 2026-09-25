import React from 'react';
import { useDashboard } from '@/hooks/useDashboard';
import { StatCard } from '@/components/ui/StatCard';
import { Badge } from '@/components/ui/Badge';
import { Avatar } from '@/components/ui/Avatar';
import { DashboardSkeleton, DashboardError } from '@/components/common/DashboardState';
import { Icon } from '@/assets/icons';

/**
 * AdminDashboard
 *
 * Data source: GET /api/v1/dashboard/admin (via useDashboard → role
 * ADMIN). All numbers come from the backend — no mock data.
 *
 * UI unchanged: same stat-card row + registration list styling, colors
 * and components.
 */
export function AdminDashboard() {
  const { data, loading, error, refresh } = useDashboard();

  if (loading) return <DashboardSkeleton cards={5} />;
  if (error || !data || data.kind !== 'admin') {
    return <DashboardError message={error ?? undefined} onRetry={refresh} />;
  }

  const { summary, recentUsers } = data;

  const stats = [
    { title: 'Total Users', value: String(summary.totalUsers), icon: <Icon.Users />, color: '#2563EB' },
    { title: 'Students', value: String(summary.totalStudents), icon: <Icon.User />, color: '#059669' },
    { title: 'Managers', value: String(summary.totalManagers), icon: <Icon.FileText />, color: '#7C3AED' },
    { title: 'Courses', value: String(summary.totalCourses), icon: <Icon.Book />, color: '#D97706' },
    { title: 'Exams', value: String(summary.totalExams), icon: <Icon.ClipboardList />, color: '#0891B2' },
  ];

  return (
    <div className="p-8 space-y-7">
      {/* Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
        {stats.map((s) => (
          <StatCard key={s.title} {...s} />
        ))}
      </div>

      {/* Recent Registrations */}
      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-[#F3F4F6] flex items-center justify-between">
          <h4 className="text-[15px] font-semibold text-foreground">
            Recent Registrations
          </h4>
          <Badge variant="default">{recentUsers.length} users</Badge>
        </div>
        {recentUsers.length === 0 ? (
          <p className="px-5 py-6 text-[13.5px] text-muted-foreground">
            No user registrations yet.
          </p>
        ) : (
          <div className="divide-y divide-line">
            {recentUsers.map((user) => (
              <div key={user.userId} className="flex items-center gap-3 px-5 py-3">
                <Avatar name={user.fullName} size="sm" />
                <div className="flex-1 min-w-0">
                  <p className="text-[13.5px] font-medium text-foreground truncate">
                    {user.fullName}
                  </p>
                  <p className="text-[12px] text-muted-foreground truncate">
                    {user.email}
                  </p>
                </div>
                <Badge
                  variant={
                    user.role === 'ADMIN'
                      ? 'danger'
                      : user.role === 'COURSE_MANAGER'
                        ? 'purple'
                        : 'info'
                  }
                  className="text-[11px]"
                >
                  {user.role}
                </Badge>
                <span className="text-[12px] text-muted-foreground w-32 text-right flex-shrink-0">
                  {user.createdAt
                    ? new Date(user.createdAt).toLocaleDateString()
                    : '—'}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
