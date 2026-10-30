import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { Button } from '@/components/ui/Button';
import { Table, type TableColumn } from '@/components/ui/Table';
import { Dropdown, type DropdownItem } from '@/components/ui/Dropdown';
import { EmptyState } from '@/components/ui/Card';
import { Select } from '@/components/ui/Select';
import { Badge, type BadgeVariant } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/ToastHost';
import { SearchInput } from '@/components/common/SearchInput';
import { Icon } from '@/assets/icons';
import {
  ROUTES,
  studentCoursePath,
  studentExamAttemptsPath,
  studentResumeAttemptPath,
  studentTakeExamPath,
  studentTakePracticePath,
} from '@/app/routes';
import { getApiErrorMessage } from '@/utils/apiError';
import { studentCourseService } from '@/services/studentCourse.service';
import { studentPracticeExamService } from '@/services/studentPracticeExam.service';
import { materialService } from '@/services/studentMaterial.service';
import { ListSkeleton, LoadError, PageTitle, STUDENT_PAGE_CLASS, formatDate, formatScore } from '../components/studentUi';
const PAGE_SIZE = 10;
const ALL = '';
/** Practice exams are scored out of 10 (PracticeExamService.createGeneratedExam). */
const PRACTICE_MAX_SCORE = 10;

/** Exam.mode of a row (ME-01 `mode`). */
type ExamKind = 'EXAM' | 'PRACTICE' | 'SMART_PRACTICE' | 'MATERIAL_QUIZ' | 'CONTEST';

const KIND_LABEL: Record<ExamKind, string> = {
  EXAM: 'Course exam',
  PRACTICE: 'Practice exam',
  SMART_PRACTICE: 'Smart practice',
  MATERIAL_QUIZ: 'Material quiz',
  CONTEST: 'Contest',
};
const KIND_BADGE: Record<ExamKind, BadgeVariant> = {
  EXAM: 'default',
  PRACTICE: 'info',
  SMART_PRACTICE: 'purple',
  MATERIAL_QUIZ: 'success',
  CONTEST: 'warning',
};
const KIND_OPTIONS = [{ label: 'All types', value: ALL }, ...(Object.keys(KIND_LABEL) as ExamKind[]).map(k => ({ label: KIND_LABEL[k], value: k }))];

/** Type filter value for exams with a CODE question (ME-01 `hasCodeQuestions`) — across every kind. */
const CODE_FILTER = 'CODE';
const CODE_OPTION = { label: 'Coding exam', value: CODE_FILTER };

const toKind = (mode: string | null | undefined): ExamKind => (mode && mode in KIND_LABEL ? (mode as ExamKind) : 'EXAM');

/** One exam of the history, whatever produced it. */
interface HistoryRow {
  examId: number;
  title: string;
  kind: ExamKind;
  courseId: number | null;
  courseTitle: string | null;
  maxScore: number | null;
  attemptCount: number;
  bestScore: number | null;
  /** PQ-02 entry — retake and delete need it. */
  practiceId: number | null;
  /** MQ-06 job — a material quiz is retaken with MQ-05. */
  jobId: number | null;
  /** Material the quiz was generated from. */
  documentTitle: string | null;
  /** Set for rows not taken yet (from PQ-02 / MQ-06): they sort by it. */
  createdAt: string | null;
  /** Has a CODE question (ME-01 only). */
  hasCode?: boolean;
  /** Its course was left (EN-04): listed, but neither its attempts nor a retake open. */
  courseLeft?: boolean;
}

type SortKey = 'recent' | 'title' | 'bestScoreDesc' | 'bestScoreAsc' | 'attempts';

const SORT_OPTIONS: { label: string; value: SortKey }[] = [
  { label: 'Most recent', value: 'recent' },
  { label: 'Exam name (A–Z)', value: 'title' },
  { label: 'Best score (high → low)', value: 'bestScoreDesc' },
  { label: 'Best score (low → high)', value: 'bestScoreAsc' },
  { label: 'Most attempts', value: 'attempts' },
];

/** Best score as a share of the max, so exams with different max scores compare fairly; untaken = -1. */
const ratio = (e: HistoryRow) => (e.bestScore == null || !e.maxScore ? -1 : Number(e.bestScore) / Number(e.maxScore));

function sortRows(list: HistoryRow[], sort: SortKey): HistoryRow[] {
  // mergeHistory already puts the most recent first.
  if (sort === 'recent') return list;
  const copy = [...list];
  if (sort === 'title') copy.sort((a, b) => a.title.localeCompare(b.title));
  if (sort === 'bestScoreDesc') copy.sort((a, b) => ratio(b) - ratio(a));
  if (sort === 'bestScoreAsc') copy.sort((a, b) => ratio(a) - ratio(b));
  if (sort === 'attempts') copy.sort((a, b) => b.attemptCount - a.attemptCount);
  return copy;
}

/**
 * ME-01 lists every exam with an attempt (course exams, practice, smart practice, material quizzes),
 * newest attempt first. PQ-02 and MQ-06 add what only they know (practiceId / jobId) and the
 * practice exams and material quizzes not taken yet — those go on top, newest first.
 */
async function loadHistory(): Promise<HistoryRow[]> {
  const [exams, practices, materials, myCourses] = await Promise.all([
    studentCourseService.getAllMyExams(),
    studentPracticeExamService.listAll(),
    materialService.allHistory(),
    // MC-01 tells which courses were left; without it no row is locked (SA-01 still refuses).
    studentCourseService.getMyCourses({ page: 0, size: 100 }).catch(() => null),
  ]);
  const leftCourses = new Set(
    (myCourses?.content ?? []).filter(c => c.status === 'CANCELLED').map(c => c.courseId),
  );
  const practiceByExam = new Map(practices.map(p => [p.examId, p]));
  const materialByQuiz = new Map(materials.filter(m => m.quizId != null).map(m => [m.quizId as number, m]));

  const taken: HistoryRow[] = exams.map(e => {
    const practice = practiceByExam.get(e.examId);
    const material = materialByQuiz.get(e.examId);
    return {
      examId: e.examId,
      title: e.title,
      // Without `mode` (older BE) the PQ-02 / MQ-06 match still tells the type.
      kind: e.mode ? toKind(e.mode) : practice ? 'PRACTICE' : material ? 'MATERIAL_QUIZ' : 'EXAM',
      courseId: e.courseId ?? null,
      courseTitle: e.courseTitle ?? null,
      maxScore: e.maxScore,
      attemptCount: e.attemptCount,
      bestScore: e.bestScore,
      practiceId: practice?.practiceId ?? null,
      jobId: material?.jobId ?? null,
      documentTitle: material?.documentTitle ?? null,
      createdAt: null,
      hasCode: e.hasCodeQuestions === true,
      courseLeft: e.courseId != null && leftCourses.has(e.courseId),
    };
  });
  const takenIds = new Set(exams.map(e => e.examId));
  const untaken: HistoryRow[] = [
    ...practices
      .filter(p => !takenIds.has(p.examId))
      .map(p => ({
        examId: p.examId,
        title: p.title,
        kind: 'PRACTICE' as const,
        courseId: null,
        courseTitle: null,
        maxScore: PRACTICE_MAX_SCORE,
        attemptCount: p.attemptCount ?? 0,
        bestScore: p.bestScore,
        practiceId: p.practiceId,
        jobId: null,
        documentTitle: null,
        createdAt: p.createdAt,
      })),
    ...materials
      .filter(m => m.quizId != null && !takenIds.has(m.quizId))
      .map(m => ({
        examId: m.quizId as number,
        title: m.documentTitle,
        kind: 'MATERIAL_QUIZ' as const,
        courseId: null,
        courseTitle: null,
        maxScore: null,
        attemptCount: m.attemptCount,
        bestScore: m.bestScore,
        practiceId: null,
        jobId: m.jobId,
        documentTitle: m.documentTitle,
        createdAt: m.createdAt,
      })),
  ].sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));
  return [...untaken, ...taken];
}

/**
 * Exam History — every exam the student has taken or generated: course exams (ME-01), practice
 * exams (PQ-02), smart practice (AI-01) and quizzes generated from a material (MQ-06), with a
 * type filter. Lists are loaded whole and searched, filtered and sorted here.
 * `?type=PRACTICE` (etc.) preselects the type filter.
 */
export function MyExamsPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [searchParams] = useSearchParams();
  const [page, setPage] = useState(1);
  const [reload, setReload] = useState(0);
  const [rows, setRows] = useState<HistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [course, setCourse] = useState(ALL);
  const [kind, setKind] = useState(() => {
    const type = searchParams.get('type') ?? '';
    return type in KIND_LABEL || type === CODE_FILTER ? type : ALL;
  });
  const [sort, setSort] = useState<SortKey>('recent');

  const [startingJob, setStartingJob] = useState<number | null>(null);
  const [toDelete, setToDelete] = useState<HistoryRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    loadHistory()
      .then(res => {
        if (!cancelled) setRows(res);
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
    const byId = new Map(rows.filter(r => r.courseId != null).map(r => [r.courseId as number, r.courseTitle ?? 'Untitled course']));
    return [
      { label: 'All courses', value: ALL },
      ...[...byId].sort((a, b) => a[1].localeCompare(b[1])).map(([id, title]) => ({ label: title, value: String(id) })),
    ];
  }, [rows]);

  const term = search.trim().toLowerCase();
  const filtered = useMemo(
    () =>
      sortRows(
        rows.filter(
          r =>
            (course === ALL || String(r.courseId) === course) &&
            (kind === ALL || (kind === CODE_FILTER ? r.hasCode === true : r.kind === kind)) &&
            (!term || r.title.toLowerCase().includes(term) || (r.documentTitle ?? '').toLowerCase().includes(term)),
        ),
        sort,
      ),
    [rows, course, kind, term, sort],
  );
  const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const filtersActive = term !== '' || course !== ALL || kind !== ALL || sort !== 'recent';

  const withPageReset =
    <T,>(setter: (v: T) => void) =>
    (v: T) => {
      setter(v);
      setPage(1);
    };
  const clearFilters = () => {
    setSearch('');
    setCourse(ALL);
    setKind(ALL);
    setSort('recent');
    setPage(1);
  };

  /** A material quiz gets a fresh attempt from MQ-05; the rest start with SA-01. */
  const retake = async (row: HistoryRow) => {
    if (row.kind === 'PRACTICE' || row.kind === 'SMART_PRACTICE') {
      navigate(studentTakePracticePath(row.examId));
      return;
    }
    if (row.kind === 'MATERIAL_QUIZ' && row.jobId != null) {
      setStartingJob(row.jobId);
      try {
        const started = await materialService.start(row.jobId);
        navigate(studentResumeAttemptPath(started.attemptId));
      } catch (err) {
        toast.error(getApiErrorMessage(err, 'Failed to start the quiz.'));
        setStartingJob(null);
      }
      return;
    }
    navigate(studentTakeExamPath(row.examId));
  };

  /** A deleted practice exam is archived on the BE: its attempts stay, it cannot be taken again. */
  const canRetake = (row: HistoryRow) =>
    !row.courseLeft && (row.kind === 'PRACTICE' ? row.practiceId != null : row.kind !== 'MATERIAL_QUIZ' || row.jobId != null);

  /** Attempts of a left course are closed to the student. */
  const canViewAttempts = (row: HistoryRow) => row.attemptCount > 0 && !row.courseLeft;

  const confirmDelete = async () => {
    if (toDelete?.practiceId == null) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await studentPracticeExamService.remove(toDelete.practiceId);
      toast.success(`Deleted "${toDelete.title}".`);
      setToDelete(null);
      setReload(r => r + 1);
    } catch (err) {
      setDeleteError(getApiErrorMessage(err, 'Failed to delete the practice exam.'));
    } finally {
      setDeleting(false);
    }
  };

  /** Row actions for the "…" menu — only the ones that apply to this exam. */
  const rowActions = (row: HistoryRow): DropdownItem[] => {
    const items: DropdownItem[] = [];
    if (canViewAttempts(row)) {
      items.push({ label: 'View attempts', icon: <Icon.Eye />, onClick: () => navigate(studentExamAttemptsPath(row.examId)) });
    }
    if (canRetake(row)) {
      const starting = row.jobId != null && startingJob === row.jobId;
      items.push({
        label: starting ? 'Starting…' : row.attemptCount > 0 ? 'Retake' : 'Start',
        icon: <Icon.RefreshCw />,
        disabled: startingJob != null,
        onClick: () => void retake(row),
      });
    }
    if (row.practiceId != null) {
      items.push({
        label: 'Delete',
        icon: <Icon.Trash />,
        danger: true,
        onClick: () => {
          setDeleteError(null);
          setToDelete(row);
        },
      });
    }
    return items;
  };

  const asRow = (r: Record<string, unknown>) => r as unknown as HistoryRow;

  const columns: TableColumn[] = [
    {
      key: 'title',
      label: 'Exam',
      className: 'min-w-[16rem]',
      render: r => {
        const row = asRow(r);
        return (
          <div className="min-w-0">
            <div className="flex items-center gap-2 min-w-0">
              {canViewAttempts(row) ? (
                <button
                  type="button"
                  onClick={() => navigate(studentExamAttemptsPath(row.examId))}
                  className="truncate text-sm font-semibold text-content text-left hover:text-primary hover:underline"
                  title={row.title}
                >
                  {row.title}
                </button>
              ) : (
                <span className="truncate text-sm font-semibold text-content" title={row.title}>
                  {row.title}
                </span>
              )}
              {row.hasCode && (
                <Badge variant="warning" size="sm">
                  Code
                </Badge>
              )}
            </div>
            {(row.documentTitle && row.documentTitle !== row.title) || row.createdAt ? (
              <p className="flex gap-x-3 text-xs text-content-subtle truncate">
                {row.documentTitle && row.documentTitle !== row.title && <span className="truncate">From {row.documentTitle}</span>}
                {row.createdAt && <span className="whitespace-nowrap">Created {formatDate(row.createdAt)}</span>}
              </p>
            ) : null}
          </div>
        );
      },
    },
    {
      key: 'kind',
      label: 'Type',
      render: r => {
        const row = asRow(r);
        return (
          <Badge variant={KIND_BADGE[row.kind]} size="sm" className="whitespace-nowrap">
            {KIND_LABEL[row.kind]}
          </Badge>
        );
      },
    },
    {
      key: 'courseTitle',
      label: 'Course',
      render: r => {
        const row = asRow(r);
        return row.courseId != null && row.courseTitle ? (
          <div className="min-w-0">
            <button
              type="button"
              onClick={() => navigate(studentCoursePath(row.courseId as number))}
              className="block max-w-full truncate text-left text-sm text-content-secondary hover:text-primary hover:underline"
              title={row.courseTitle}
            >
              {row.courseTitle}
            </button>
            {row.courseLeft && (
              <Badge variant="default" size="sm" className="mt-0.5 whitespace-nowrap">
                Left course
              </Badge>
            )}
          </div>
        ) : (
          <span className="text-content-subtle">—</span>
        );
      },
    },
    {
      key: 'attemptCount',
      label: 'Attempts',
      width: '96px',
      render: r => <span className="font-medium text-content">{asRow(r).attemptCount}</span>,
    },
    {
      key: 'bestScore',
      label: 'Best score',
      width: '120px',
      render: r => {
        const row = asRow(r);
        return <span className="whitespace-nowrap font-medium text-content">{formatScore(row.bestScore, row.maxScore)}</span>;
      },
    },
    {
      key: 'actions',
      label: '',
      width: '56px',
      render: r => {
        const row = asRow(r);
        const items = rowActions(row);
        return items.length === 0 ? null : (
          <Dropdown
            trigger={
              <button type="button" aria-label={`Actions for ${row.title}`} className="p-1.5 hover:bg-accent rounded-[6px]">
                <Icon.MoreHorizontal className="w-4 h-4 text-content-soft" />
              </button>
            }
            items={items}
          />
        );
      },
    },
  ];

  return (
    <div className={`${STUDENT_PAGE_CLASS} space-y-[clamp(1.25rem,2.5vw,1.75rem)]`}>
      <PageTitle
        title="Exam History"
        subtitle="Course exams, practice exams and quizzes from your materials — with your best score on each."
      />

      {!loading && !error && rows.length > 0 && (
        <div className="card px-4 py-3 flex flex-wrap lg:flex-nowrap items-center gap-3">
          <SearchInput
            className="w-full sm:w-60 lg:w-auto lg:min-w-0 lg:flex-[1.5]"
            placeholder="Search exams…"
            aria-label="Search exams"
            value={search}
            onChange={e => withPageReset(setSearch)(e.target.value)}
          />
          <Select
            aria-label="Filter by exam type"
            value={kind}
            onChange={withPageReset(setKind)}
            // "Coding exam" only once the BE marks exams with CODE questions (or it is preselected by ?type=CODE).
            options={rows.some(r => r.hasCode) || kind === CODE_FILTER ? [...KIND_OPTIONS, CODE_OPTION] : KIND_OPTIONS}
            className="w-full sm:w-44 lg:w-auto lg:min-w-0 lg:flex-1"
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
      ) : rows.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={<Icon.ClipboardList className="w-7 h-7" />}
            title="No exams taken yet"
            message="Open one of your courses to start an exam, or build a practice quiz from My Courses."
            action={<Button onClick={() => navigate(ROUTES.studentCourses)}>Go to My Courses</Button>}
          />
        </div>
      ) : filtered.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={<Icon.Search className="w-7 h-7" />}
            title="No matching exams"
            message="Try another name, type or course."
            action={
              <Button variant="outline" onClick={clearFilters}>
                Clear filters
              </Button>
            }
          />
        </div>
      ) : (
        <div className="card overflow-hidden">
          <Table
            columns={columns}
            data={pageItems as unknown as Record<string, unknown>[]}
            perPage={PAGE_SIZE}
            serverPagination={{ page, total: filtered.length, onChange: setPage }}
            unit="exams"
          />
        </div>
      )}

      <Modal
        open={toDelete != null}
        onClose={() => !deleting && setToDelete(null)}
        title="Delete this practice exam?"
        size="sm"
        footer={
          <>
            <Button variant="outline" disabled={deleting} onClick={() => setToDelete(null)}>
              Cancel
            </Button>
            <Button variant="danger" loading={deleting} disabled={deleting} icon={<Icon.Trash className="w-4 h-4" />} onClick={confirmDelete}>
              Delete
            </Button>
          </>
        }
      >
        <p className="text-base text-content-secondary leading-relaxed">
          <span className="font-semibold text-content">{toDelete?.title}</span> can no longer be taken. Attempts you already took
          stay in your history.
        </p>
        {deleteError && <p className="mt-3 text-sm text-danger">{deleteError}</p>}
      </Modal>
    </div>
  );
}
