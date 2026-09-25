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
 * Fluid layout: stat/course grids are auto-fit minmax(280px,1fr) so cards
 * reflow smoothly at any width or zoom level; spacing uses clamp();
 * thumbnails use aspect-ratio instead of fixed heights.
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
    <div className="space-y-[clamp(1.25rem,2.5vw,1.75rem)]">
      {/* Statistics row — auto-fit minmax(280px,1fr) */}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-[clamp(1rem,2vw,1.25rem)]">
        {stats.map((s) => (
          <StatCard key={s.title} {...s} />
        ))}
      </div>

      {/* Recent Courses */}
      <div className="space-y-[clamp(1rem,2vw,1.25rem)]">
        <h3 className="text-[clamp(1rem,0.95rem+0.3vw,1.125rem)] font-semibold text-foreground">My Courses</h3>
        {recentCourses.length === 0 ? (
          <p className="text-[0.85rem] text-muted-foreground">
            You are not enrolled in any courses yet.
          </p>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-[clamp(1rem,2vw,1.25rem)]">
            {recentCourses.map((course) => (
              <div key={course.courseId} className="card overflow-hidden flex flex-col">
                {/* Thumbnail (placeholder when null) — aspect-ratio, no fixed height */}
                {course.thumbnailUrl ? (
                  <img
                    src={course.thumbnailUrl}
                    alt={course.title}
                    width={640}
                    height={360}
                    className="w-full aspect-video object-cover"
                  />
                ) : (
                  <div className="w-full aspect-video bg-primary-light flex items-center justify-center">
                    <Icon.Book className="w-8 h-8 text-primary" />
                  </div>
                )}
                <div className="p-4 flex flex-col gap-3 flex-1">
                  <h4 className="text-[0.875rem] font-semibold text-foreground leading-snug">
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
      <div className="space-y-[clamp(1rem,2vw,1.25rem)]">
        <h3 className="text-[clamp(1rem,0.95rem+0.3vw,1.125rem)] font-semibold text-foreground">Recent Attempts</h3>
        {recentAttempts.length === 0 ? (
          <p className="text-[0.85rem] text-muted-foreground">
            You have not taken any exams yet.
          </p>
        ) : (
          <div className="card overflow-x-auto">
            {recentAttempts.map((attempt, i) => (
              <div
                key={attempt.attemptId}
                className={`flex flex-wrap items-center gap-x-4 gap-y-1 px-[clamp(0.875rem,1.5vw,1.25rem)] py-3.5 ${
                  i > 0 ? 'border-t border-line' : ''
                }`}
              >
                <div className="w-9 h-9 rounded-[0.625rem] bg-primary-light flex items-center justify-center flex-shrink-0">
                  <Icon.ClipboardList className="w-4.5 h-4.5 text-primary" />
                </div>
                <div className="flex-1 min-w-[10rem]">
                  <p className="text-[0.85rem] font-medium text-foreground break-words">
                    {attempt.examTitle}
                  </p>
                  <p className="text-[0.75rem] text-muted-foreground">
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
                <span className="text-[0.875rem] font-semibold text-foreground w-14 text-right">
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
