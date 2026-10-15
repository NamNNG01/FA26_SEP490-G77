import React from 'react';
import { Progress } from '@/components/ui/Progress';
import { Icon } from '@/assets/icons';
import type { StudentRecentCourse } from '@/services/dashboard.service';

function EmptyText({ children }: { children: React.ReactNode }) {
  return <p className="text-[13px] text-[#9CA3AF]">{children}</p>;
}

function LoadingRows() {
  return (
    <div className="space-y-3">
      {[0, 1].map((i) => (
        <div key={i} className="h-8 rounded bg-[#F3F4F6] animate-pulse" />
      ))}
    </div>
  );
}

/** Progress Overview widget: progress bar + percentage per ongoing course. */
export function ProgressOverviewCard({
  courses,
  loading,
  tracksLearning,
}: {
  courses: StudentRecentCourse[];
  loading: boolean;
  tracksLearning: boolean;
}) {
  return (
    <div className="card p-6">
      <h4 className="text-[16px] font-semibold text-[#111827] mb-4">Progress Overview</h4>
      {loading ? (
        <LoadingRows />
      ) : !tracksLearning ? (
        <EmptyText>Learning progress is tracked for student accounts.</EmptyText>
      ) : courses.length === 0 ? (
        <EmptyText>No courses in progress.</EmptyText>
      ) : (
        <div className="space-y-4">
          {courses.map((course) => (
            <Progress key={course.courseId} label={course.title} value={course.progress ?? 0} />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Finished Courses panel. The dashboard DTO has no completion timestamp,
 * so each row shows "Completed" instead of a date.
 */
export function FinishedCoursesCard({
  courses,
  loading,
  tracksLearning,
}: {
  courses: StudentRecentCourse[];
  loading: boolean;
  tracksLearning: boolean;
}) {
  return (
    <div className="card p-6">
      <h4 className="text-[16px] font-semibold text-[#111827] mb-4">Finished Courses</h4>
      {loading ? (
        <LoadingRows />
      ) : !tracksLearning ? (
        <EmptyText>Finished courses are listed for student accounts.</EmptyText>
      ) : courses.length === 0 ? (
        <EmptyText>No finished courses yet.</EmptyText>
      ) : (
        <ul className="space-y-3">
          {courses.map((course) => (
            <li key={course.courseId} className="flex items-center gap-3">
              <span className="w-8 h-8 rounded-[8px] bg-[#F0FDF4] border border-[#BBF7D0] flex items-center justify-center flex-shrink-0">
                <Icon.Award className="w-4 h-4 text-[#16A34A]" />
              </span>
              <div className="min-w-0">
                <p className="text-[14px] font-semibold text-[#111827] truncate">{course.title}</p>
                <p className="text-[12px] text-[#6B7280]">Completed</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
