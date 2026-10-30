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
import { Modal } from '@/components/ui/Modal';
import {
  MATERIAL_MAX_FILES,
  errorStatus,
  isJobRunning,
  materialService,
  type MaterialItem,
  type MaterialJobBrief,
} from '@/services/studentMaterial.service';
import { ListSkeleton, LoadError, PageTitle, STUDENT_PAGE_CLASS, formatDate } from '../components/studentUi';
import { MaterialQuizModal } from '../components/MaterialQuizModal';

const PAGE_SIZE = 10;
const ALL = '';
const MY_COURSES_FETCH_SIZE = 100;
/** How often the list refreshes while a quiz is being generated. */
const REFRESH_MS = 4000;

const JOB_BADGE: Record<MaterialJobBrief['status'], { variant: 'info' | 'success' | 'danger'; label: string }> = {
  PENDING: { variant: 'info', label: 'Queued' },
  PROCESSING: { variant: 'info', label: 'Generating' },
  COMPLETED: { variant: 'success', label: 'Ready' },
  FAILED: { variant: 'danger', label: 'Failed' },
};

/** The quizzes modal shows this many quiz rows, then scrolls. */
const QUIZ_ROWS_VISIBLE = 5;
/** Height of one quiz row in the modal. */
const QUIZ_ROW_REM = 4;

/** Row button of a material — e.g. "3 quizzes", "1 quiz · generating". */
function quizCountLabel(row: MaterialItem): string {
  const count = row.jobs.length;
  const label = count === 0 ? 'No quizzes' : `${count} quiz${count === 1 ? '' : 'zes'}`;
  return row.jobs.some(j => isJobRunning(j.status)) ? `${label} · generating` : label;
}

/**
 * My Materials — files the student uploaded for the Material to Quiz Creator (MQ-02), the courses
 * each one is attached to and the quizzes generated from it. One file is one material, whatever the
 * number of courses (see materialService.listWithCourses for the current BE). "Generate quiz" opens
 * the creator with the material picked. The quizzes of a file are not listed inline: the file name (or its quiz
 * count) opens a modal with them, where a ready quiz starts with MQ-05. The list refreshes itself while a quiz is being generated.
 * An account keeps up to MATERIAL_MAX_FILES files; "Delete" removes one from every course (not while a quiz is being generated).
 */
export function MyMaterialsPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [page, setPage] = useState(1);
  const [reload, setReload] = useState(0);
  const [courses, setCourses] = useState<MyCourse[]>([]);
  const [rows, setRows] = useState<MaterialItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [course, setCourse] = useState(ALL);

  const [modal, setModal] = useState<{ courseId: number | null; documentId: number | null } | null>(null);
  const [startingJob, setStartingJob] = useState<number | null>(null);
  /** Material whose quizzes are shown in the modal (read from `rows`, so refreshes update it). */
  const [viewing, setViewing] = useState<number | null>(null);
  const [deleting, setDeleting] = useState<MaterialItem | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const loadedOnce = useRef(false);

  useEffect(() => {
    let cancelled = false;
    // Background refreshes keep the list on screen.
    if (!loadedOnce.current) setLoading(true);
    setError(null);
    studentCourseService
      .getMyCourses({ page: 0, size: MY_COURSES_FETCH_SIZE })
      .then(async res => {
        const { items: list } = await materialService.listWithCourses(res.content.map(c => ({ courseId: c.courseId, title: c.title })));
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
          (course === ALL || (r.courses ?? []).some(c => String(c.courseId) === course)) &&
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

  /** The filtered course when the material has it, else its first course. */
  const courseForQuiz = (row: MaterialItem) => {
    const ids = (row.courses ?? []).map(c => c.courseId);
    return course !== ALL && ids.includes(Number(course)) ? Number(course) : (ids[0] ?? null);
  };

  /** Course name on a quiz chip — only needed when the material has several courses. */
  const jobCourse = (row: MaterialItem, job: MaterialJobBrief) =>
    (row.courses ?? []).length > 1 && job.courseId != null ? (row.courses ?? []).find(c => c.courseId === job.courseId)?.title : undefined;

  const closeModal = () => {
    setModal(null);
    setReload(r => r + 1);
  };

  const viewingRow = viewing == null ? null : (rows.find(r => r.documentId === viewing) ?? null);

  const confirmDelete = async () => {
    if (!deleting) return;
    setDeleteBusy(true);
    try {
      await materialService.remove(deleting.documentId);
      toast.success(`Deleted "${deleting.title}"`);
    } catch (err) {
      const status = errorStatus(err);
      if (status === 404) toast.success(`"${deleting.title}" was already deleted`);
      else
        toast.error(
          status === 409
            ? 'A quiz is being generated from this material. Delete it once the quiz is ready.'
            : getApiErrorMessage(err, 'Failed to delete the material.'),
        );
    } finally {
      setDeleteBusy(false);
      setDeleting(null);
      setReload(r => r + 1);
    }
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
        subtitle={`Lecture notes and slides you uploaded, and the quizzes the AI generated from them.${
          loading || error ? '' : ` ${Math.min(rows.length, MATERIAL_MAX_FILES)}/${MATERIAL_MAX_FILES} files used.`
        }`}
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
              <li key={row.documentId} className="px-[clamp(0.875rem,1.5vw,1.25rem)] py-4">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
                  <div className="w-9 h-9 rounded-[10px] bg-primary-light flex items-center justify-center flex-shrink-0">
                    <Icon.FileText className="w-4.5 h-4.5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-[12rem]">
                    <button
                      type="button"
                      onClick={() => setViewing(row.documentId)}
                      className="text-left text-sm font-semibold text-content break-words hover:text-brand-ink hover:underline"
                    >
                      {row.title}
                    </button>
                    {(row.courses ?? []).length > 0 && (
                      <div className="flex flex-wrap gap-1.5 my-1">
                        {(row.courses ?? []).map(c => (
                          <button
                            key={c.courseId}
                            type="button"
                            onClick={() => navigate(studentCoursePath(c.courseId))}
                            className="rounded-full bg-primary-light px-2.5 py-0.5 text-2xs font-medium text-primary hover:underline"
                          >
                            {c.title}
                          </button>
                        ))}
                      </div>
                    )}
                    <p className="flex flex-wrap gap-x-3 text-xs text-content-subtle">
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
                  <Button size="sm" variant="outline" icon={<Icon.ClipboardList className="w-4 h-4" />} onClick={() => setViewing(row.documentId)}>
                    {quizCountLabel(row)}
                  </Button>
                  <Button
                    size="sm"
                    icon={<Icon.Zap className="w-4 h-4" />}
                    onClick={() => setModal({ courseId: courseForQuiz(row), documentId: row.documentId })}
                  >
                    Generate quiz
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={<Icon.Trash className="w-4 h-4" />}
                    aria-label={`Delete ${row.title}`}
                    title={row.jobs.some(j => isJobRunning(j.status)) ? 'A quiz is being generated from this material' : 'Delete material'}
                    disabled={row.jobs.some(j => isJobRunning(j.status))}
                    onClick={() => setDeleting(row)}
                  />
                </div>
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

      <Modal
        open={viewingRow != null}
        onClose={() => setViewing(null)}
        title={viewingRow ? `Quizzes from ${viewingRow.title}` : undefined}
        size="lg"
        footer={
          viewingRow && (
            <>
              <Button variant="outline" onClick={() => setViewing(null)}>
                Close
              </Button>
              <Button
                icon={<Icon.Zap className="w-4 h-4" />}
                onClick={() => {
                  setViewing(null);
                  setModal({ courseId: courseForQuiz(viewingRow), documentId: viewingRow.documentId });
                }}
              >
                Generate quiz
              </Button>
            </>
          )
        }
      >
        {viewingRow &&
          (viewingRow.jobs.length === 0 ? (
            <EmptyState
              icon={<Icon.ClipboardList className="w-7 h-7" />}
              title="No quizzes yet"
              message="Generate a quiz and the AI writes multiple-choice questions from this file."
            />
          ) : (
            // Rows are a fixed QUIZ_ROW_REM tall (+ 1px divider), so the list shows QUIZ_ROWS_VISIBLE and scrolls past that.
            <ul
              className="divide-y divide-line overflow-y-auto overscroll-contain rounded-[12px] border border-line"
              style={{ maxHeight: `calc(${QUIZ_ROWS_VISIBLE * QUIZ_ROW_REM}rem + ${QUIZ_ROWS_VISIBLE}px)` }}
            >
              {viewingRow.jobs.map((job, i) => (
                <li
                  key={job.jobId}
                  className="flex items-center gap-3 px-4"
                  style={{ height: `${QUIZ_ROW_REM}rem` }}
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-content">Quiz {viewingRow.jobs.length - i}</p>
                    <p className="truncate text-xs text-content-subtle">
                      {job.questionCount} questions
                      {jobCourse(viewingRow, job) && <> · {jobCourse(viewingRow, job)}</>}
                    </p>
                  </div>
                  <Badge variant={JOB_BADGE[job.status].variant} size="sm">
                    {JOB_BADGE[job.status].label}
                  </Badge>
                  {job.status === 'COMPLETED' && (
                    <Button
                      size="sm"
                      loading={startingJob === job.jobId}
                      disabled={startingJob != null}
                      icon={<Icon.ChevronRight className="w-4 h-4" />}
                      onClick={() => startQuiz(job.jobId)}
                    >
                      Start
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          ))}
      </Modal>

      <Modal
        open={deleting != null}
        onClose={() => !deleteBusy && setDeleting(null)}
        title="Delete material?"
        size="sm"
        footer={
          <>
            <Button variant="outline" disabled={deleteBusy} onClick={() => setDeleting(null)}>
              Cancel
            </Button>
            <Button variant="danger" loading={deleteBusy} onClick={confirmDelete}>
              Delete
            </Button>
          </>
        }
      >
        {deleting && (
          <div className="space-y-2 text-sm text-content-secondary">
            <p>
              <span className="font-semibold text-content">{deleting.title}</span> will be removed
              {(deleting.courses ?? []).length > 1 ? ` from all ${(deleting.courses ?? []).length} courses it is in` : ''}, and the
              quizzes generated from it leave your material quiz list.
            </p>
            <p className="text-content-soft">This cannot be undone.</p>
          </div>
        )}
      </Modal>
    </div>
  );
}
