import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Pagination } from '@/components/ui/Pagination';
import { EmptyState } from '@/components/ui/Card';
import { SearchInput } from '@/components/common/SearchInput';
import { Icon } from '@/assets/icons';
import { ROUTES, studentCoursePath, studentWeaknessReportPath } from '@/app/routes';
import { useDashboard } from '@/hooks/useDashboard';
import type { StudentRecentAttempt } from '@/services/dashboard.service';
import { getApiErrorMessage } from '@/utils/apiError';
import { studentCourseService, type MyCourse } from '@/services/studentCourse.service';
import { CardGridSkeleton, CourseThumb, LoadError, PageTitle, STUDENT_PAGE_CLASS, formatDate } from '../components/studentUi';
import { MaterialQuizModal } from '../components/MaterialQuizModal';
import { SmartPracticeModal } from '../components/SmartPracticeModal';
import { RecommendationsCard } from '../components/RecommendationsCard';
import { AiSparkle } from '../components/aiUi';

const PAGE_SIZE = 12;
/** MC-01 caps `size` at 100 and has no keyword filter, so the list is loaded once and searched client-side. */
const MY_COURSES_FETCH_SIZE = 100;
const RECENT_ATTEMPTS = 3;

function matchesSearch(course: MyCourse, term: string) {
  return [course.title, course.category?.name, course.manager?.fullName].some(v => v?.toLowerCase().includes(term));
}

/**
 * My Courses — the student home (the old dashboard is merged in here).
 *
 *  - recent attempts:            GET /dashboard/student
 *  - enrolled courses grid:      MC-01
 *  - search box:                 filters the enrolled courses only (title,
 *                                category, manager) — not the public catalog.
 *  - Material to Quiz Creator:   AI quiz generated from a file the student uploads (MaterialQuizModal, MQ-01..MQ-05).
 *  - Smart Practice:             practice exam — AI-01/02 (weak modules) or PQ-01 (random questions).
 *  - Recommended for you:        AI-03 card for one picked course (called on demand).
 */
export function MyCoursesPage() {
  const navigate = useNavigate();
  const { data: dashboard } = useDashboard();
  const student = dashboard?.kind === 'student' ? dashboard : null;

  const [page, setPage] = useState(1);
  const [reload, setReload] = useState(0);
  const [search, setSearch] = useState('');
  const [quizModal, setQuizModal] = useState<'material' | 'smart' | null>(null);
  const [smartCourseId, setSmartCourseId] = useState<number | null>(null);

  const [courses, setCourses] = useState<MyCourse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    studentCourseService
      .getMyCourses({ page: 0, size: MY_COURSES_FETCH_SIZE })
      .then(res => {
        // Courses left with EN-04 come back as CANCELLED; they are no longer the student's.
        if (!cancelled) setCourses(res.content.filter(c => c.status !== 'CANCELLED'));
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
  }, [reload]);

  const term = search.trim().toLowerCase();
  const filtered = useMemo(() => (term ? courses.filter(c => matchesSearch(c, term)) : courses), [courses, term]);
  const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const openSmartPractice = (courseId: number | null = null) => {
    setSmartCourseId(courseId);
    setQuizModal('smart');
  };

  const changeSearch = (value: string) => {
    setSearch(value);
    setPage(1);
  };

  return (
    <div className={`${STUDENT_PAGE_CLASS} space-y-[clamp(1.25rem,2.5vw,1.75rem)]`}>
      <PageTitle
        title="My Courses"
        subtitle="Your enrolled courses and latest results."
        action={
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
            <Button variant="outline" icon={<AiSparkle />} onClick={() => openSmartPractice()}>
              Smart Practice
            </Button>
            <Button variant="outline" icon={<Icon.Brain className="w-4 h-4" />} onClick={() => setQuizModal('material')}>
              Material to Quiz Creator
            </Button>
            <div role="search" className="w-full sm:w-auto">
              <SearchInput
                className="w-full sm:w-72"
                placeholder="Search my courses…"
                aria-label="Search my courses"
                value={search}
                onChange={e => changeSearch(e.target.value)}
              />
            </div>
          </div>
        }
      />

      {!loading && !error && courses.length > 0 && <RecommendationsCard courses={courses} onSmartPractice={openSmartPractice} />}

      {loading ? (
        <CardGridSkeleton />
      ) : error ? (
        <LoadError message={error} onRetry={() => setReload(r => r + 1)} />
      ) : courses.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={<Icon.Book className="w-7 h-7" />}
            title="You are not enrolled in any course yet"
            message="Browse the catalog to find a course to start with."
            action={<Button onClick={() => navigate(ROUTES.courses)}>Browse courses</Button>}
          />
        </div>
      ) : filtered.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={<Icon.Search className="w-7 h-7" />}
            title="No matching courses"
            message={`None of your courses match "${search.trim()}".`}
            action={
              <Button variant="outline" onClick={() => changeSearch('')}>
                Clear search
              </Button>
            }
          />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-[clamp(1rem,2vw,1.25rem)]">
            {pageItems.map(c => (
              <MyCourseCard key={c.courseId} course={c} onOpen={() => navigate(studentCoursePath(c.courseId))} />
            ))}
          </div>
          <div className="card">
            <Pagination page={page} total={filtered.length} perPage={PAGE_SIZE} onChange={setPage} unit="courses" />
          </div>
        </>
      )}

      <MaterialQuizModal open={quizModal === 'material'} onClose={() => setQuizModal(null)} courses={courses} />
      <SmartPracticeModal open={quizModal === 'smart'} onClose={() => setQuizModal(null)} courses={courses} initialCourseId={smartCourseId} />

      {student && student.recentAttempts.length > 0 && (
        <RecentAttempts attempts={student.recentAttempts.slice(0, RECENT_ATTEMPTS)} onViewAll={() => navigate(ROUTES.studentExams)} />
      )}
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

/** The card body opens the course; the footer link is outside that button (a link can't sit inside a button). */
function MyCourseCard({ course, onOpen }: { course: MyCourse; onOpen: () => void }) {
  return (
    <div className="card overflow-hidden flex flex-col hover:shadow-md transition-shadow">
      <button
        type="button"
        onClick={onOpen}
        className="flex flex-col flex-1 text-left focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary"
      >
        <CourseThumb url={course.thumbnailUrl} title={course.title} />
        <div className="p-4 flex flex-col gap-3 flex-1">
          <span className="text-2xs font-medium text-content-subtle truncate">{course.category?.name ?? 'Uncategorized'}</span>
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
      <Link
        to={studentWeaknessReportPath(course.courseId)}
        className="flex items-center gap-1.5 border-t border-line px-4 py-2.5 text-xs font-medium text-primary hover:bg-surface-hover focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary"
      >
        <Icon.BarChart className="w-3.5 h-3.5" /> View weakness report
        <Icon.ChevronRight className="w-3.5 h-3.5 ml-auto" />
      </Link>
    </div>
  );
}
