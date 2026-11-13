import { useEffect, useState } from 'react';
import { dashboardService, type StudentRecentCourse } from '@/services/dashboard.service';
import { studentProgressService } from '@/services/studentProgress.service';
import { Role } from '@/utils/permissions';

export interface ProfileStat {
  label: string;
  value: string;
}

export interface ProfileOverview {
  stats: ProfileStat[];
  /** Enrolled courses with progress < 100 (Progress Overview widget). */
  inProgress: StudentRecentCourse[];
  /** Enrolled courses with progress = 100 (Finished Courses panel). */
  finished: StudentRecentCourse[];
  /** Progress / finished courses only exist for students. */
  tracksLearning: boolean;
}

const EMPTY: ProfileOverview = { stats: [], inProgress: [], finished: [], tracksLearning: false };

/**
 * Header statistics + learning widgets for the profile page.
 *
 * There is no profile-specific statistics endpoint, so this reuses the
 * role dashboard (GET /dashboard/{student|course-manager|admin}):
 *  - STUDENT: summary counts + recentCourses (backend returns the 5 most
 *    recent enrollments), split by progress into in-progress / finished.
 *  - COURSE_MANAGER / ADMIN: summary counts only (no personal learning data).
 */
export function useProfileOverview(role: string | undefined) {
  const [data, setData] = useState<ProfileOverview>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function load(): Promise<ProfileOverview> {
      if (role === Role.STUDENT) {
        const { summary, recentCourses } = await dashboardService.getStudentDashboard();
        // The dashboard sends the stored percent; LP-01 gives the live one (and stores it).
        // A course LP-01 refuses (not ACTIVE) keeps the dashboard's.
        const live = new Map<number, number>();
        await studentProgressService.refreshCoursesProgress(
          (recentCourses ?? []).map(c => c.courseId),
          (courseId, progress) => live.set(courseId, progress),
          () => cancelled,
        );
        const courses = (recentCourses ?? []).map(c => (live.has(c.courseId) ? { ...c, progress: live.get(c.courseId) ?? c.progress } : c));
        return {
          stats: [
            { label: 'Enrolled Courses', value: String(summary.enrolledCourses) },
            { label: 'Completed Courses', value: String(summary.completedCourses) },
            { label: 'Exam Attempts', value: String(summary.totalAttempts) },
            { label: 'Average Score', value: `${Math.round(summary.averageScore * 10) / 10}%` },
          ],
          inProgress: courses.filter((c) => (c.progress ?? 0) < 100),
          finished: courses.filter((c) => (c.progress ?? 0) >= 100),
          tracksLearning: true,
        };
      }
      if (role === Role.COURSE_MANAGER) {
        const { summary } = await dashboardService.getManagerDashboard();
        return {
          ...EMPTY,
          stats: [
            { label: 'Total Courses', value: String(summary.totalCourses) },
            { label: 'Published', value: String(summary.publishedCourses) },
            { label: 'Drafts', value: String(summary.draftCourses) },
            { label: 'Students', value: String(summary.totalStudents) },
          ],
        };
      }
      if (role === Role.ADMIN) {
        const { summary } = await dashboardService.getAdminDashboard();
        return {
          ...EMPTY,
          stats: [
            { label: 'Total Users', value: String(summary.totalUsers) },
            { label: 'Students', value: String(summary.totalStudents) },
            { label: 'Courses', value: String(summary.totalCourses) },
            { label: 'Exams', value: String(summary.totalExams) },
          ],
        };
      }
      return EMPTY;
    }

    setLoading(true);
    setError('');
    load()
      .then((next) => {
        if (!cancelled) setData(next);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Could not load your statistics.');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [role]);

  return { ...data, loading, error };
}
