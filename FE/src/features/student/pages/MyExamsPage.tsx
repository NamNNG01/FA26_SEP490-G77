import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { Button } from '@/components/ui/Button';
import { Pagination } from '@/components/ui/Pagination';
import { EmptyState } from '@/components/ui/Card';
import { Select } from '@/components/ui/Select';
import { SearchInput } from '@/components/common/SearchInput';
import { Icon } from '@/assets/icons';
import { ROUTES, studentCoursePath, studentExamAttemptsPath, studentTakeExamPath } from '@/app/routes';
import { getApiErrorMessage } from '@/utils/apiError';
import { studentCourseService, type MyExam } from '@/services/studentCourse.service';
import { ListSkeleton, LoadError, PageTitle, STUDENT_PAGE_CLASS, formatScore } from '../components/studentUi';

const PAGE_SIZE = 10;
const ALL = '';

type SortKey = 'recent' | 'title' | 'bestScoreDesc' | 'bestScoreAsc' | 'attempts';

const SORT_OPTIONS: { label: string; value: SortKey }[] = [
  { label: 'Most recent', value: 'recent' },
  { label: 'Exam name (A–Z)', value: 'title' },
  { label: 'Best score (high → low)', value: 'bestScoreDesc' },
  { label: 'Best score (low → high)', value: 'bestScoreAsc' },
  { label: 'Most attempts', value: 'attempts' },
];

/** Best score as a share of the max, so exams with different max scores compare fairly; untaken = -1. */
const ratio = (e: MyExam) => (e.bestScore == null || !e.maxScore ? -1 : Number(e.bestScore) / Number(e.maxScore));

function sortExams(list: MyExam[], sort: SortKey): MyExam[] {
  // ME-01 already returns the most recent first.
  if (sort === 'recent') return list;
  const copy = [...list];
  if (sort === 'title') copy.sort((a, b) => a.title.localeCompare(b.title));
  if (sort === 'bestScoreDesc') copy.sort((a, b) => ratio(b) - ratio(a));
  if (sort === 'bestScoreAsc') copy.sort((a, b) => ratio(a) - ratio(b));
  if (sort === 'attempts') copy.sort((a, b) => b.attemptCount - a.attemptCount);
  return copy;
}

/**
 * My Exams — every exam the student has attempted, with attempt count and
 * best score (ME-01). Exams not taken yet are listed on each course page.
 * ME-01 has no filter params, so the whole list is loaded once and searched,
 * filtered by course and sorted here.
 */
export function MyExamsPage() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [reload, setReload] = useState(0);
  const [exams, setExams] = useState<MyExam[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [course, setCourse] = useState(ALL);
  const [sort, setSort] = useState<SortKey>('recent');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    studentCourseService
      .getAllMyExams()
      .then(res => {
        if (!cancelled) setExams(res);
      })
      .catch(err => {
        if (!cancelled) setError(getApiErrorMessage(err, 'Failed to load your exams.'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [reload]);

  const courseOptions = useMemo(() => {
    const byId = new Map(exams.map(e => [e.courseId, e.courseTitle ?? 'Untitled course']));
    return [
      { label: 'All courses', value: ALL },
      ...[...byId].sort((a, b) => a[1].localeCompare(b[1])).map(([id, title]) => ({ label: title, value: String(id) })),
    ];
  }, [exams]);

  const term = search.trim().toLowerCase();
  const filtered = useMemo(
    () =>
      sortExams(
        exams.filter(e => (course === ALL || String(e.courseId) === course) && (!term || e.title.toLowerCase().includes(term))),
        sort,
      ),
    [exams, course, term, sort],
  );
  const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const filtersActive = term !== '' || course !== ALL || sort !== 'recent';

  const withPageReset =
    <T,>(setter: (v: T) => void) =>
    (v: T) => {
      setter(v);
      setPage(1);
    };
  const clearFilters = () => {
    setSearch('');
    setCourse(ALL);
    setSort('recent');
    setPage(1);
  };

  return (
    <div className={`${STUDENT_PAGE_CLASS} space-y-[clamp(1.25rem,2.5vw,1.75rem)]`}>
      <PageTitle title="My Exams" subtitle="Exams you have taken and your best score on each." />

      {!loading && !error && exams.length > 0 && (
        <div className="card px-4 py-3 flex flex-wrap lg:flex-nowrap items-center gap-3">
          <SearchInput
            className="w-full sm:w-60 lg:w-auto lg:min-w-0 lg:flex-[1.5]"
            placeholder="Search exams…"
            aria-label="Search exams"
            value={search}
            onChange={e => withPageReset(setSearch)(e.target.value)}
          />
          <Select
            aria-label="Filter by course"
            value={course}
            onChange={withPageReset(setCourse)}
            options={courseOptions}
            className="w-full sm:w-52 lg:w-auto lg:min-w-0 lg:flex-[1.25]"
          />
          <Select
            aria-label="Sort exams"
            value={sort}
            onChange={withPageReset(v => setSort(v as SortKey))}
            options={SORT_OPTIONS}
            className="w-full sm:w-52 lg:w-auto lg:min-w-0 lg:flex-1"
          />
          {filtersActive && (
            <button
              type="button"
              onClick={clearFilters}
              className="shrink-0 whitespace-nowrap text-sm font-medium text-brand-ink hover:underline"
            >
              Clear filters
            </button>
          )}
        </div>
      )}

      {loading ? (
        <ListSkeleton />
      ) : error ? (
        <LoadError message={error} onRetry={() => setReload(r => r + 1)} />
      ) : exams.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={<Icon.ClipboardList className="w-7 h-7" />}
            title="No exams taken yet"
            message="Open one of your courses to start an exam."
            action={<Button onClick={() => navigate(ROUTES.studentCourses)}>Go to My Courses</Button>}
          />
        </div>
      ) : filtered.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={<Icon.Search className="w-7 h-7" />}
            title="No matching exams"
            message="Try another name or course."
            action={
              <Button variant="outline" onClick={clearFilters}>
                Clear filters
              </Button>
            }
          />
        </div>
      ) : (
        <div className="card overflow-hidden">
          <ul className="divide-y divide-line">
            {pageItems.map(exam => (
              <li key={exam.examId} className="flex flex-wrap items-center gap-x-4 gap-y-3 px-[clamp(0.875rem,1.5vw,1.25rem)] py-4">
                <div className="w-9 h-9 rounded-[10px] bg-primary-light flex items-center justify-center flex-shrink-0">
                  <Icon.Award className="w-4.5 h-4.5 text-primary" />
                </div>
                <div className="flex-1 min-w-[12rem]">
                  <button
                    type="button"
                    onClick={() => navigate(studentExamAttemptsPath(exam.examId))}
                    className="block text-sm font-semibold text-content break-words text-left hover:text-primary hover:underline"
                  >
                    {exam.title}
                  </button>
                  <button
                    type="button"
                    onClick={() => navigate(studentCoursePath(exam.courseId))}
                    className="text-xs text-content-subtle hover:text-primary hover:underline text-left"
                  >
                    {exam.courseTitle}
                  </button>
                </div>
                <div className="flex gap-6 text-center">
                  <div>
                    <p className="text-sm font-semibold text-content">{exam.attemptCount}</p>
                    <p className="text-2xs text-content-subtle">Attempts</p>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-content">{formatScore(exam.bestScore, exam.maxScore)}</p>
                    <p className="text-2xs text-content-subtle">Best score</p>
                  </div>
                </div>
                <Button
                  size="sm"
                  icon={<Icon.Eye className="w-4 h-4" />}
                  onClick={() => navigate(studentExamAttemptsPath(exam.examId))}
                >
                  View attempts
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  icon={<Icon.RefreshCw className="w-4 h-4" />}
                  onClick={() => navigate(studentTakeExamPath(exam.examId))}
                >
                  Retake
                </Button>
              </li>
            ))}
          </ul>
          <div className="border-t border-line">
            <Pagination page={page} total={filtered.length} perPage={PAGE_SIZE} onChange={setPage} unit="exams" />
          </div>
        </div>
      )}
    </div>
  );
}
