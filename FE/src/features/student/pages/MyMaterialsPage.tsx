import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { Button } from '@/components/ui/Button';
import { Pagination } from '@/components/ui/Pagination';
import { EmptyState } from '@/components/ui/Card';
import { Select } from '@/components/ui/Select';
import { Badge } from '@/components/ui/Badge';
import { useToast } from '@/components/ui/ToastHost';
import { SearchInput } from '@/components/common/SearchInput';
import { Icon } from '@/assets/icons';
import { ROUTES, studentCoursePath, studentResumeAttemptPath } from '@/app/routes';
import { getApiErrorMessage } from '@/utils/apiError';
import { studentCourseService, type MyCourse } from '@/services/studentCourse.service';
import { isJobRunning, materialService, type MaterialItem, type MaterialJobBrief } from '@/services/studentMaterial.service';
import { ListSkeleton, LoadError, PageTitle, STUDENT_PAGE_CLASS, formatDate } from '../components/studentUi';
import { MaterialQuizModal } from '../components/MaterialQuizModal';

const PAGE_SIZE = 10;
const ALL = '';
const MY_COURSES_FETCH_SIZE = 100;
/** How often the list refreshes while a quiz is being generated. */
const REFRESH_MS = 4000;

interface MaterialRow extends MaterialItem {
  courseId: number;
  courseTitle: string;
}

const JOB_BADGE: Record<MaterialJobBrief['status'], { variant: 'info' | 'success' | 'danger'; label: string }> = {
  PENDING: { variant: 'info', label: 'Queued' },
  PROCESSING: { variant: 'info', label: 'Generating' },
  COMPLETED: { variant: 'success', label: 'Ready' },
  FAILED: { variant: 'danger', label: 'Failed' },
};

/** MQ-02 per enrolled course (MaterialItem has no courseId), newest upload first. */
async function loadMaterials(courses: MyCourse[]): Promise<MaterialRow[]> {
  const lists = await Promise.all(
    courses.map(c =>
      materialService.listAll(c.courseId).then(items => items.map(m => ({ ...m, courseId: c.courseId, courseTitle: c.title }))),
    ),
  );
  return lists.flat().sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
}

/**
 * My Materials — files the student uploaded for the Material to Quiz Creator (MQ-02) and the
 * quizzes generated from each one. "Generate quiz" opens the creator with the material picked;
 * a ready quiz starts with MQ-05. The list refreshes itself while a quiz is being generated.
 */
export function MyMaterialsPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [page, setPage] = useState(1);
  const [reload, setReload] = useState(0);
  const [courses, setCourses] = useState<MyCourse[]>([]);
  const [rows, setRows] = useState<MaterialRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [course, setCourse] = useState(ALL);

  const [modal, setModal] = useState<{ courseId: number | null; documentId: number | null } | null>(null);
  const [startingJob, setStartingJob] = useState<number | null>(null);
  const loadedOnce = useRef(false);

  useEffect(() => {
    let cancelled = false;
    // Background refreshes keep the list on screen.
    if (!loadedOnce.current) setLoading(true);
    setError(null);
    studentCourseService
      .getMyCourses({ page: 0, size: MY_COURSES_FETCH_SIZE })
      .then(async res => {
        const list = await loadMaterials(res.content);
        if (cancelled) return;
        setCourses(res.content);
        setRows(list);
        loadedOnce.current = true;
      })
      .catch(err => {
        if (!cancelled) setError(getApiErrorMessage(err, 'Failed to load your materials.'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [reload]);

  // Keep running jobs up to date (not while the creator is open — it polls on its own).
  const anyRunning = rows.some(r => r.jobs.some(j => isJobRunning(j.status)));
  useEffect(() => {
    if (!anyRunning || modal) return;
    const timer = window.setTimeout(() => setReload(r => r + 1), REFRESH_MS);
    return () => window.clearTimeout(timer);
  }, [anyRunning, modal, rows]);

  const courseOptions = useMemo(
    () => [{ label: 'All courses', value: ALL }, ...courses.map(c => ({ label: c.title, value: String(c.courseId) }))],
    [courses],
  );

  const term = search.trim().toLowerCase();
  const filtered = useMemo(
    () =>
      rows.filter(
        r =>
          (course === ALL || String(r.courseId) === course) &&
          (!term || r.title.toLowerCase().includes(term) || r.fileName.toLowerCase().includes(term)),
      ),
    [rows, course, term],
  );
  const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const filtersActive = term !== '' || course !== ALL;

  const clearFilters = () => {
    setSearch('');
    setCourse(ALL);
    setPage(1);
  };

  const startQuiz = async (jobId: number) => {
    setStartingJob(jobId);
    try {
      const started = await materialService.start(jobId);
      navigate(studentResumeAttemptPath(started.attemptId));
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Failed to start the quiz.'));
      setStartingJob(null);
    }
  };

  const closeModal = () => {
    setModal(null);
    setReload(r => r + 1);
  };

  const uploadButton = (
    <Button
      icon={<Icon.Upload className="w-4 h-4" />}
      disabled={courses.length === 0}
      onClick={() => setModal({ courseId: course === ALL ? null : Number(course), documentId: null })}
    >
      Upload material
    </Button>
  );

  return (
    <div className={`${STUDENT_PAGE_CLASS} space-y-[clamp(1.25rem,2.5vw,1.75rem)]`}>
      <PageTitle
        title="My Materials"
        subtitle="Lecture notes and slides you uploaded, and the quizzes the AI generated from them."
        action={!loading && !error ? uploadButton : undefined}
      />

      {!loading && !error && rows.length > 0 && (
        <div className="card px-4 py-3 flex flex-wrap lg:flex-nowrap items-center gap-3">
          <SearchInput
            className="w-full sm:w-60 lg:w-auto lg:min-w-0 lg:flex-[1.5]"
            placeholder="Search materials…"
            aria-label="Search materials"
            value={search}
            onChange={e => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
          <Select
            aria-label="Filter by course"
            value={course}
            onChange={v => {
              setCourse(v);
              setPage(1);
            }}
            options={courseOptions}
            className="w-full sm:w-52 lg:w-auto lg:min-w-0 lg:flex-[1.25]"
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
      ) : courses.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={<Icon.Book className="w-7 h-7" />}
            title="You are not enrolled in any course yet"
            message="Materials are uploaded for a course you study."
            action={<Button onClick={() => navigate(ROUTES.courses)}>Browse courses</Button>}
          />
        </div>
      ) : rows.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={<Icon.FileText className="w-7 h-7" />}
            title="No materials yet"
            message="Upload a PDF or DOCX and the AI turns it into a multiple-choice quiz."
            action={uploadButton}
          />
        </div>
      ) : filtered.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={<Icon.Search className="w-7 h-7" />}
            title="No matching materials"
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
            {pageItems.map(row => (
              <li key={row.documentId} className="px-[clamp(0.875rem,1.5vw,1.25rem)] py-4 space-y-3">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
                  <div className="w-9 h-9 rounded-[10px] bg-primary-light flex items-center justify-center flex-shrink-0">
                    <Icon.FileText className="w-4.5 h-4.5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-[12rem]">
                    <p className="text-sm font-semibold text-content break-words">{row.title}</p>
                    <p className="flex flex-wrap gap-x-3 text-xs text-content-subtle">
                      <button
                        type="button"
                        onClick={() => navigate(studentCoursePath(row.courseId))}
                        className="hover:text-primary hover:underline text-left"
                      >
                        {row.courseTitle}
                      </button>
                      <span className="truncate max-w-[16rem]" title={row.fileName}>
                        {row.fileName}
                      </span>
                      {row.pageCount != null && (
                        <span>
                          {row.pageCount} page{row.pageCount === 1 ? '' : 's'}
                        </span>
                      )}
                      <span>Uploaded {formatDate(row.uploadedAt)}</span>
                    </p>
                  </div>
                  <Button
                    size="sm"
                    icon={<Icon.Zap className="w-4 h-4" />}
                    onClick={() => setModal({ courseId: row.courseId, documentId: row.documentId })}
                  >
                    Generate quiz
                  </Button>
                </div>

                {row.jobs.length > 0 && (
                  <ul aria-label={`Quizzes from ${row.title}`} className="flex flex-wrap gap-2 sm:pl-13">
                    {row.jobs.map(job => (
                      <li
                        key={job.jobId}
                        className="flex items-center gap-2 rounded-[10px] border border-line bg-surface-alt px-3 py-1.5 text-xs text-content-secondary"
                      >
                        <span>{job.questionCount} questions</span>
                        <Badge variant={JOB_BADGE[job.status].variant} size="sm">
                          {JOB_BADGE[job.status].label}
                        </Badge>
                        {job.status === 'COMPLETED' && (
                          <Button
                            size="sm"
                            variant="ghost"
                            loading={startingJob === job.jobId}
                            disabled={startingJob != null}
                            onClick={() => startQuiz(job.jobId)}
                          >
                            Start
                          </Button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
          <div className="border-t border-line">
            <Pagination page={page} total={filtered.length} perPage={PAGE_SIZE} onChange={setPage} unit="materials" />
          </div>
        </div>
      )}

      <MaterialQuizModal
        open={modal != null}
        onClose={closeModal}
        courses={courses}
        initialCourseId={modal?.courseId ?? null}
        initialDocumentId={modal?.documentId ?? null}
      />
    </div>
  );
}
