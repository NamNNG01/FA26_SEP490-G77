import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { Button } from '@/components/ui/Button';
import { Badge, type BadgeVariant } from '@/components/ui/Badge';
import { Select } from '@/components/ui/Select';
import { Table, type TableColumn } from '@/components/ui/Table';
import { Alert } from '@/components/ui/Alert';
import { SearchInput } from '@/components/common/SearchInput';
import { Icon } from '@/assets/icons';
import { useDebounce } from '@/hooks';
import { ROUTES, managerQuestionEditPath } from '@/app/routes';
import { courseService, type CourseModuleResponse, type CourseSummaryItem } from '@/services/course.service';
import { questionService, type QuestionListItem, type QuestionPage } from '@/services/question.service';

const PAGE_SIZE = 10;
const ALL = 'all';

const TYPE_LABELS: Record<string, string> = {
  SINGLE_CHOICE: 'Single Choice',
  MULTIPLE_CHOICE: 'Multiple Choice',
  TRUE_FALSE: 'True/False',
  MATCHING: 'Matching',
  FILL_BLANK: 'Fill in Blank',
  ESSAY: 'Essay',
  CODE: 'Code',
  DIAGRAM: 'Diagram',
};
const DIFFICULTY_LABELS: Record<string, string> = { EASY: 'Easy', MEDIUM: 'Medium', HARD: 'Hard' };
const STATUS_LABELS: Record<string, string> = { ACTIVE: 'Active', INACTIVE: 'Inactive', DRAFT: 'Draft' };

const TYPE_VARIANT: Record<string, BadgeVariant> = { ESSAY: 'purple', TRUE_FALSE: 'success', CODE: 'warning', DIAGRAM: 'warning' };
const DIFFICULTY_VARIANT: Record<string, BadgeVariant> = { EASY: 'success', MEDIUM: 'warning', HARD: 'danger' };
const STATUS_VARIANT: Record<string, BadgeVariant> = { ACTIVE: 'success', INACTIVE: 'danger', DRAFT: 'default' };

const toOptions = (allLabel: string, labels: Record<string, string>) => [
  { label: allLabel, value: ALL },
  ...Object.entries(labels).map(([value, label]) => ({ label, value })),
];
const TYPE_OPTIONS = toOptions('All Types', TYPE_LABELS);
const DIFFICULTY_OPTIONS = toOptions('All Difficulty', DIFFICULTY_LABELS);
const STATUS_OPTIONS = toOptions('All Status', STATUS_LABELS);

const relativeFormat = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
const dateFormat = new Intl.DateTimeFormat('en', { dateStyle: 'medium' });

/** "5 minutes ago" for the last week, then an absolute date. */
function formatUpdated(iso: string | null): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  const seconds = Math.round((date.getTime() - Date.now()) / 1000);
  const abs = Math.abs(seconds);
  if (abs < 60) return relativeFormat.format(seconds, 'second');
  if (abs < 3600) return relativeFormat.format(Math.round(seconds / 60), 'minute');
  if (abs < 86400) return relativeFormat.format(Math.round(seconds / 3600), 'hour');
  if (abs < 7 * 86400) return relativeFormat.format(Math.round(seconds / 86400), 'day');
  return dateFormat.format(date);
}

const optionalNumber = (v: string) => (v === ALL ? undefined : Number(v));
const optionalString = (v: string) => (v === ALL ? undefined : v);

type Row = QuestionListItem & { id: number };
const asRow = (r: Record<string, unknown>) => r as unknown as Row;

export function QuestionBankPage() {
  const navigate = useNavigate();

  const [query, setQuery] = useState('');
  const [course, setCourse] = useState(ALL);
  const [module, setModule] = useState(ALL);
  const [type, setType] = useState(ALL);
  const [difficulty, setDifficulty] = useState(ALL);
  const [status, setStatus] = useState(ALL);
  const [page, setPage] = useState(1);
  const debouncedQuery = useDebounce(query.trim(), 400);

  const [courses, setCourses] = useState<CourseSummaryItem[]>([]);
  const [modules, setModules] = useState<CourseModuleResponse[]>([]);

  const [result, setResult] = useState<QuestionPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  // Course options load once; module options follow the selected course.
  useEffect(() => {
    let cancelled = false;
    courseService.getCourses({ size: 100 }).then(res => {
      if (!cancelled) setCourses(res.content);
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (course === ALL) {
      setModules([]);
      return;
    }
    let cancelled = false;
    courseService.getCourseModules(course).then(res => {
      if (!cancelled) setModules([...res].sort((a, b) => a.orderIndex - b.orderIndex));
    });
    return () => { cancelled = true; };
  }, [course]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    questionService
      .getQuestions({
        search: debouncedQuery || undefined,
        courseId: optionalNumber(course),
        moduleId: optionalNumber(module),
        questionType: optionalString(type),
        difficulty: optionalString(difficulty),
        status: optionalString(status),
        page: page - 1,
        size: PAGE_SIZE,
      })
      .then(res => {
        if (cancelled) return;
        setResult(res);
        // A filter change or deletion can leave us past the last page.
        if (res.totalPages > 0 && page > res.totalPages) setPage(res.totalPages);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message || 'Could not load questions.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [debouncedQuery, course, module, type, difficulty, status, page, reloadKey]);

  // Any filter change starts back at page 1.
  const filterSetter = (setter: (v: string) => void) => (v: string) => {
    setter(v);
    setPage(1);
  };
  const changeCourse = (v: string) => {
    setCourse(v);
    setModule(ALL);
    setPage(1);
  };
  const changeQuery = (v: string) => {
    setQuery(v);
    setPage(1);
  };

  const rows: Row[] = (result?.content ?? []).map(q => ({ ...q, id: q.questionId }));

  const columns: TableColumn[] = [
    {
      key: 'content',
      label: 'Question',
      width: '40%',
      render: r => (
        <p className="text-sm font-medium text-content line-clamp-2 whitespace-normal" title={asRow(r).content}>
          {asRow(r).content}
        </p>
      ),
    },
    {
      key: 'module',
      label: 'Module',
      render: r => {
        const q = asRow(r);
        return (
          <div className="min-w-0">
            {q.moduleName ? <Badge variant="info">{q.moduleName}</Badge> : <span className="text-content-subtle">—</span>}
            <p className="text-2xs text-content-subtle mt-1 truncate">{q.courseName ?? '—'}</p>
          </div>
        );
      },
    },
    {
      key: 'questionType',
      label: 'Type',
      render: r => {
        const t = asRow(r).questionType;
        return <Badge variant={TYPE_VARIANT[t] ?? 'info'}>{TYPE_LABELS[t] ?? t}</Badge>;
      },
    },
    {
      key: 'difficulty',
      label: 'Difficulty',
      render: r => {
        const d = asRow(r).difficulty;
        return d ? <Badge variant={DIFFICULTY_VARIANT[d] ?? 'default'}>{DIFFICULTY_LABELS[d] ?? d}</Badge> : <span className="text-content-subtle">—</span>;
      },
    },
    {
      key: 'status',
      label: 'Status',
      render: r => {
        const s = asRow(r).status;
        return <Badge variant={STATUS_VARIANT[s] ?? 'default'}>{STATUS_LABELS[s] ?? s}</Badge>;
      },
    },
    {
      key: 'updatedAt',
      label: 'Updated',
      render: r => {
        const iso = asRow(r).updatedAt;
        return (
          <span className="text-sm text-content-soft whitespace-nowrap" title={iso ? new Date(iso).toLocaleString() : undefined}>
            {formatUpdated(iso)}
          </span>
        );
      },
    },
  ];

  const filtersActive = query !== '' || [course, module, type, difficulty, status].some(v => v !== ALL);
  const clearFilters = () => {
    setQuery('');
    setCourse(ALL);
    setModule(ALL);
    setType(ALL);
    setDifficulty(ALL);
    setStatus(ALL);
    setPage(1);
  };

  return (
    <div className="p-4 sm:p-8 space-y-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xl font-bold text-content">Question</h2>
        <Button icon={<Icon.Plus className="w-4 h-4" />} onClick={() => navigate(ROUTES.managerQuestionCreate)}>
          Add Question
        </Button>
      </div>

      <div className="card px-4 py-3 flex flex-wrap items-center gap-3">
        <SearchInput
          className="w-full sm:w-60"
          placeholder="Search questions…"
          value={query}
          onChange={e => changeQuery(e.target.value)}
          aria-label="Search questions"
        />
        <Select
          aria-label="Filter by course"
          value={course}
          onChange={changeCourse}
          options={[{ label: 'All Courses', value: ALL }, ...courses.map(c => ({ label: c.title, value: String(c.courseId) }))]}
          className="w-full sm:w-48"
        />
        <Select
          aria-label="Filter by module"
          value={module}
          onChange={filterSetter(setModule)}
          disabled={course === ALL}
          options={[
            { label: course === ALL ? 'Select a course first' : 'All Modules', value: ALL },
            ...modules.map(m => ({ label: m.title, value: String(m.moduleId) })),
          ]}
          className="w-full sm:w-48"
        />
        <Select aria-label="Filter by type" value={type} onChange={filterSetter(setType)} options={TYPE_OPTIONS} className="w-full sm:w-40" />
        <Select aria-label="Filter by difficulty" value={difficulty} onChange={filterSetter(setDifficulty)} options={DIFFICULTY_OPTIONS} className="w-full sm:w-36" />
        <Select aria-label="Filter by status" value={status} onChange={filterSetter(setStatus)} options={STATUS_OPTIONS} className="w-full sm:w-32" />
        {filtersActive && (
          <button type="button" onClick={clearFilters} className="text-sm font-medium text-brand-ink hover:underline">
            Clear filters
          </button>
        )}
      </div>

      {error && (
        <div className="space-y-2">
          <Alert type="error" title="Could not load questions" message={error} />
          <Button variant="secondary" size="sm" onClick={() => setReloadKey(k => k + 1)}>Try again</Button>
        </div>
      )}

      <div className={`card overflow-hidden transition-opacity ${loading && result ? 'opacity-60' : ''}`} aria-busy={loading}>
        <Table
          columns={columns}
          data={rows as unknown as Record<string, unknown>[]}
          selectable
          perPage={PAGE_SIZE}
          unit="questions"
          serverPagination={{ page, total: result?.totalElements ?? 0, onChange: setPage }}
          onRowClick={r => navigate(managerQuestionEditPath(asRow(r).questionId))}
          emptyState={
            loading ? 'Loading questions…'
              : error ? null
              : filtersActive ? 'No questions match your filters.'
              : 'No questions yet. Click “Add Question” to create one.'
          }
        />
      </div>
    </div>
  );
}
