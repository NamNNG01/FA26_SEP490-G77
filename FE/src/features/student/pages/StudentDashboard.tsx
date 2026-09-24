import React from 'react';
import { useDashboard } from '@/hooks/useDashboard';
import { StatCard } from '@/components/ui/StatCard';
import { Progress } from '@/components/ui/Progress';
import { Badge } from '@/components/ui/Badge';
import { DashboardSkeleton, DashboardError } from '@/components/common/DashboardState';
import { Icon } from '@/assets/icons';

/**
 * StudentDashboard
 *
 * Data source: GET /api/v1/dashboard/student (via useDashboard → role
 * STUDENT). All numbers come from the backend — no mock data.
 *
 * UI unchanged: same stat-card row, course grid and activity layout, same
 * colors and components.
 */
export function StudentDashboard() {
  const { data, loading, error, refresh } = useDashboard();

  if (loading) return <DashboardSkeleton />;
  if (error || !data || data.kind !== 'student') {
    return <DashboardError message={error ?? undefined} onRetry={refresh} />;
  }

  const { summary, recentCourses, recentAttempts } = data;

  const stats = [
    { title: 'Enrolled Courses', value: String(summary.enrolledCourses), icon: <Icon.Book />, color: '#2563EB' },
    { title: 'Active Courses', value: String(summary.activeCourses), icon: <Icon.Book className="w-5 h-5" />, color: '#7C3AED' },
    { title: 'Completed Courses', value: String(summary.completedCourses), icon: <Icon.CheckCircle className="w-5 h-5" />, color: '#059669' },
    { title: 'Average Score', value: `${summary.averageScore}%`, icon: <Icon.TrendingUp />, color: '#D97706' },
  ];

  return (
    <div className="p-8 space-y-7">
      {/* Statistics row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {stats.map((s) => (
          <StatCard key={s.title} {...s} />
        ))}
      </div>

      {/* Recent Courses */}
      <div className="space-y-5">
        <h3 className="text-[16px] font-semibold text-foreground">My Courses</h3>
        {recentCourses.length === 0 ? (
          <p className="text-[13.5px] text-muted-foreground">
            You are not enrolled in any courses yet.
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            {recentCourses.map((course) => (
              <div key={course.courseId} className="card overflow-hidden flex flex-col">
                {/* Thumbnail (placeholder when null) */}
                {course.thumbnailUrl ? (
                  <img
                    src={course.thumbnailUrl}
                    alt={course.title}
                    className="w-full h-28 object-cover"
                  />
                ) : (
                  <div className="w-full h-28 bg-primary-light flex items-center justify-center">
                    <Icon.Book className="w-8 h-8 text-primary" />
                  </div>
                )}
                <div className="p-4 flex flex-col gap-3 flex-1">
                  <h4 className="text-[14px] font-semibold text-foreground leading-snug">
                    {course.title}
                  </h4>
                  {course.progress !== null && (
                    <Progress value={course.progress} label="Progress" size="sm" />
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Recent Attempts */}
      <div className="space-y-4">
        <h3 className="text-[16px] font-semibold text-foreground">Recent Attempts</h3>
        {recentAttempts.length === 0 ? (
          <p className="text-[13.5px] text-muted-foreground">
            You have not taken any exams yet.
          </p>
        ) : (
          <div className="card overflow-hidden">
            {recentAttempts.map((attempt, i) => (
              <div
                key={attempt.attemptId}
                className={`flex items-center gap-4 px-5 py-3.5 ${
                  i > 0 ? 'border-t border-line' : ''
                }`}
              >
                <div className="w-9 h-9 rounded-[10px] bg-primary-light flex items-center justify-center flex-shrink-0">
                  <Icon.ClipboardList className="w-4.5 h-4.5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13.5px] font-medium text-foreground truncate">
                    {attempt.examTitle}
                  </p>
                  <p className="text-[12px] text-muted-foreground">
                    {attempt.submittedAt
                      ? new Date(attempt.submittedAt).toLocaleString()
                      : '—'}
                  </p>
                </div>
                <Badge
                  variant={attempt.status === 'PASSED' ? 'success' : attempt.status === 'FAILED' ? 'danger' : 'info'}
                >
                  {attempt.status}
                </Badge>
                <span className="text-[14px] font-semibold text-foreground w-14 text-right">
                  {attempt.score !== null ? `${attempt.score}%` : '—'}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
