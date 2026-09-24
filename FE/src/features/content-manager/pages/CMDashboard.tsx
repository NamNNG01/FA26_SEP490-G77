import React from 'react';
import { useDashboard } from '@/hooks/useDashboard';
import { StatCard } from '@/components/ui/StatCard';
import { Badge } from '@/components/ui/Badge';
import { DashboardSkeleton, DashboardError } from '@/components/common/DashboardState';
import { Icon } from '@/assets/icons';

/**
 * CMDashboard (Content Manager)
 *
 * Data source: GET /api/v1/dashboard/course-manager (via useDashboard →
 * role COURSE_MANAGER). All numbers come from the backend — no mock data.
 *
 * UI unchanged: same stat-card row + table styling, colors and components.
 */
export function CMDashboard() {
  const { data, loading, error, refresh } = useDashboard();

  if (loading) return <DashboardSkeleton cards={4} />;
  if (error || !data || data.kind !== 'manager') {
    return <DashboardError message={error ?? undefined} onRetry={refresh} />;
  }

  const { summary, recentCourses } = data;

  const stats = [
    { title: 'Total Courses', value: String(summary.totalCourses), icon: <Icon.Book />, color: '#2563EB' },
    { title: 'Published Courses', value: String(summary.publishedCourses), icon: <Icon.CheckCircle />, color: '#059669' },
    { title: 'Draft Courses', value: String(summary.draftCourses), icon: <Icon.FileText />, color: '#D97706' },
    { title: 'Total Students', value: String(summary.totalStudents), icon: <Icon.Users />, color: '#7C3AED' },
  ];

  return (
    <div className="p-8 space-y-7">
      {/* Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {stats.map((s) => (
          <StatCard key={s.title} {...s} />
        ))}
      </div>

      {/* Recent Courses */}
      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-[#F3F4F6] flex items-center justify-between">
          <h4 className="text-[15px] font-semibold text-foreground">Recent Courses</h4>
          <Badge variant="default">{recentCourses.length} courses</Badge>
        </div>
        {recentCourses.length === 0 ? (
          <p className="px-5 py-6 text-[13.5px] text-muted-foreground">
            You have not created any courses yet.
          </p>
        ) : (
          <div className="divide-y divide-line">
            {recentCourses.map((course) => (
              <div key={course.courseId} className="flex items-center gap-4 px-5 py-3.5">
                <div className="w-9 h-9 rounded-[10px] bg-primary-light flex items-center justify-center flex-shrink-0">
                  <Icon.Book className="w-4 h-4 text-primary" />
                </div>
                <p className="flex-1 min-w-0 text-[13.5px] font-medium text-foreground truncate">
                  {course.title}
                </p>
                <Badge
                  variant={
                    course.status === 'PUBLISHED'
                      ? 'success'
                      : course.status === 'DRAFT'
                        ? 'warning'
                        : 'default'
                  }
                >
                  {course.status}
                </Badge>
                <div className="flex items-center gap-1.5 text-[12.5px] text-muted-foreground w-24 justify-end flex-shrink-0">
                  <Icon.Users className="w-3.5 h-3.5" />
                  {course.studentCount ?? 0} students
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
