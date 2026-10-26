import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { Tabs } from '@/components/ui/Tabs';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Pagination } from '@/components/ui/Pagination';
import { EmptyState } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { StatCard } from '@/components/ui/StatCard';
import { SearchInput } from '@/components/common/SearchInput';
import { Icon } from '@/assets/icons';
import { ROUTES, courseSearchPath, studentCoursePath } from '@/app/routes';
import { useDashboard } from '@/hooks/useDashboard';
import type { StudentRecentAttempt, StudentSummary } from '@/services/dashboard.service';
import { getApiErrorMessage } from '@/utils/apiError';
import { studentCourseService, type EnrollmentStatus, type MyCourse } from '@/services/studentCourse.service';
import { CardGridSkeleton, CourseThumb, LoadError, PageTitle, formatDate } from '../components/studentUi';

const PAGE_SIZE = 12;
const RECENT_ATTEMPTS = 3;

type SummaryKey = 'enrolledCourses' | 'activeCourses' | 'completedCourses';

const STATUS_TABS: { label: string; status?: EnrollmentStatus; countKey: SummaryKey }[] = [
  { label: 'All', countKey: 'enrolledCourses' },
  { label: 'In progress', status: 'ACTIVE', countKey: 'activeCourses' },
  { label: 'Completed', status: 'COMPLETED', countKey: 'completedCourses' },
];

/**
 * My Courses — the student home (the old dashboard is merged in here).
 *
 *  - stat row + recent attempts: GET /dashboard/student
 *  - enrolled courses grid:      MC-01, filtered by enrollment status
 *  - search box:                 hands off to the full catalog (/courses?q=…),
 *                                the same page the landing search leads to.
 */
export function MyCoursesPage() {
  const navigate = useNavigate();
  const { data: dashboard, loading: dashboardLoading, error: dashboardError, refresh: refreshDashboard } = useDashboard();
  const student = dashboard?.kind === 'student' ? dashboard : null;

  const [tabIndex, setTabIndex] = useState(0);
  const [page, setPage] = useState(1);
  const [reload, setReload] = useState(0);
  const [search, setSearch] = useState('');

  const [courses, setCourses] = useState<MyCourse[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const status = STATUS_TABS[tabIndex].status;
  const tabLabels = STATUS_TABS.map(t => (student ? `${t.label} (${student.summary[t.countKey]})` : t.label));

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    studentCourseService
      .getMyCourses({ status, page: page - 1, size: PAGE_SIZE })
      .then(res => {
        if (cancelled) return;
        setCourses(res.content);
        setTotal(res.totalElements);
      })
      .catch(err => {
        if (!cancelled) setError(getApiErrorMessage(err, 'Failed to load your courses.'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [status, page, reload]);

  const changeTab = (label: string) => {
    setTabIndex(Math.max(tabLabels.indexOf(label), 0));
    setPage(1);
  };

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    navigate(courseSearchPath(search));
  };

  return (
    <div className="space-y-[clamp(1.25rem,2.5vw,1.75rem)]">
      <PageTitle
        title="My Courses"
        subtitle="Your enrolled courses and latest results."
        action={
          <form onSubmit={submitSearch} role="search" className="flex w-full sm:w-auto gap-2">
            <SearchInput
              className="w-full sm:w-72"
              placeholder="Find a new course…"
              aria-label="Search all courses"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            <Button type="submit" variant="outline" icon={<Icon.Search className="w-4 h-4" />}>
              Search
            </Button>
          </form>
        }
      />

      <StatsRow
        summary={student?.summary ?? null}
        loading={dashboardLoading}
        error={dashboardError}
        onRetry={refreshDashboard}
      />

      <Tabs tabs={tabLabels} active={tabLabels[tabIndex]} onChange={changeTab} variant="underline" />

      {loading ? (
        <CardGridSkeleton />
      ) : error ? (
        <LoadError message={error} onRetry={() => setReload(r => r + 1)} />
      ) : courses.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={<Icon.Book className="w-7 h-7" />}
            title={status ? 'No courses here' : 'You are not enrolled in any course yet'}
            message="Browse the catalog to find a course to start with."
            action={<Button onClick={() => navigate(ROUTES.courses)}>Browse courses</Button>}
          />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-[clamp(1rem,2vw,1.25rem)]">
            {courses.map(c => (
              <MyCourseCard key={c.courseId} course={c} onOpen={() => navigate(studentCoursePath(c.courseId))} />
            ))}
          </div>
          <div className="card">
            <Pagination page={page} total={total} perPage={PAGE_SIZE} onChange={setPage} unit="courses" />
          </div>
        </>
      )}

      {student && student.recentAttempts.length > 0 && (
        <RecentAttempts attempts={student.recentAttempts.slice(0, RECENT_ATTEMPTS)} onViewAll={() => navigate(ROUTES.studentExams)} />
      )}
    </div>
  );
}

function StatsRow({
  summary,
  loading,
  error,
  onRetry,
}: {
  summary: StudentSummary | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}) {
  if (loading) {
    return (
      <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-[clamp(1rem,2vw,1.25rem)]">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-[104px] rounded-[14px]" />
        ))}
      </div>
    );
  }
  if (error || !summary) {
    // The course list below still works — keep the failure small.
    return (
      <div className="card flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <p className="text-sm text-content-soft">{error ?? 'Your learning stats are unavailable.'}</p>
        <Button size="sm" variant="ghost" icon={<Icon.RefreshCw className="w-4 h-4" />} onClick={onRetry}>
          Retry
        </Button>
      </div>
    );
  }
  const stats = [
    { title: 'Enrolled Courses', value: String(summary.enrolledCourses), icon: <Icon.Book className="w-5 h-5" /> },
    { title: 'In Progress', value: String(summary.activeCourses), icon: <Icon.TrendingUp className="w-5 h-5" /> },
    { title: 'Completed', value: String(summary.completedCourses), icon: <Icon.CheckCircle className="w-5 h-5" /> },
    { title: 'Average Score', value: `${summary.averageScore}%`, icon: <Icon.Award className="w-5 h-5" /> },
  ];
  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-[clamp(1rem,2vw,1.25rem)]">
      {stats.map(s => (
        <StatCard key={s.title} {...s} />
      ))}
    </div>
  );
}

function RecentAttempts({ attempts, onViewAll }: { attempts: StudentRecentAttempt[]; onViewAll: () => void }) {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-content">Recent attempts</h2>
        <button type="button" onClick={onViewAll} className="text-xs font-medium text-primary hover:underline">
          View all in My Exams
        </button>
      </div>
      <ul className="card divide-y divide-line">
        {attempts.map(a => (
          <li key={a.attemptId} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-[clamp(0.875rem,1.5vw,1.25rem)] py-3.5">
            <div className="w-9 h-9 rounded-[10px] bg-primary-light flex items-center justify-center flex-shrink-0">
              <Icon.ClipboardList className="w-4.5 h-4.5 text-primary" />
            </div>
            <div className="flex-1 min-w-[10rem]">
              <p className="text-sm font-medium text-content break-words">{a.examTitle}</p>
              <p className="text-xs text-content-subtle">{a.submittedAt ? new Date(a.submittedAt).toLocaleString() : '—'}</p>
            </div>
            <Badge variant={a.status === 'PASSED' ? 'success' : a.status === 'FAILED' ? 'danger' : 'info'}>
              {a.status.replace(/_/g, ' ')}
            </Badge>
            <span className="w-14 text-right text-sm font-semibold text-content">{a.score != null ? `${a.score}%` : '—'}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function MyCourseCard({ course, onOpen }: { course: MyCourse; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="card overflow-hidden flex flex-col text-left hover:shadow-md transition-shadow focus-visible:outline-2 focus-visible:outline-primary"
    >
      <CourseThumb url={course.thumbnailUrl} title={course.title} />
      <div className="p-4 flex flex-col gap-3 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="text-2xs font-medium text-content-subtle truncate">{course.category?.name ?? 'Uncategorized'}</span>
          <Badge variant={course.status === 'COMPLETED' ? 'success' : 'info'}>
            {course.status === 'COMPLETED' ? 'Completed' : 'In progress'}
          </Badge>
        </div>
        <div>
          <h3 className="text-base font-semibold text-content leading-snug line-clamp-2">{course.title}</h3>
          {course.manager && <p className="text-xs text-content-subtle mt-0.5">by {course.manager.fullName}</p>}
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-content-soft">
          <span className="inline-flex items-center gap-1">
            <Icon.ClipboardList className="w-3.5 h-3.5" /> {course.publishedExamCount} exams
          </span>
          <span className="inline-flex items-center gap-1">
            <Icon.Layers className="w-3.5 h-3.5" /> {course.deckCount} decks
          </span>
          <span className="inline-flex items-center gap-1">
            <Icon.Calendar className="w-3.5 h-3.5" /> {formatDate(course.enrolledAt)}
          </span>
        </div>
        {course.nextExam && (
          <p className="mt-auto pt-2 border-t border-line text-xs text-content-soft truncate">
            Next exam: <span className="font-medium text-content-secondary">{course.nextExam.title}</span>
          </p>
        )}
      </div>
    </button>
  );
}
