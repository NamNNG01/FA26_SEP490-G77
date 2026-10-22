import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { Button } from '@/components/ui/Button';
import { Badge, type BadgeVariant } from '@/components/ui/Badge';
import { Select } from '@/components/ui/Select';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import { Table, type TableColumn } from '@/components/ui/Table';
import { Alert } from '@/components/ui/Alert';
import { Dropdown } from '@/components/ui/Dropdown';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/ToastHost';
import { SearchInput } from '@/components/common/SearchInput';
import { Icon } from '@/assets/icons';
import { useDebounce } from '@/hooks';
import { ROUTES, managerQuestionDuplicatePath, managerQuestionEditPath } from '@/app/routes';
import { courseService, type CourseModuleResponse, type CourseSummaryItem } from '@/services/course.service';
import { getUserRoleCode } from '@/auth/storage';
import {
  QUESTION_STATUS_LABELS,
  questionService,
  type QuestionListItem,
  type QuestionPage,
  type QuestionStatus,
} from '@/services/question.service';
import { GROUP_KIND_LABELS, asGroupKind, kindOf } from '../model';
import { loadCreateDraft } from '../createDraft';

const PAGE_SIZE = 10;
const ALL = 'all';

const TYPE_LABELS: Record<string, string> = {
  SINGLE_CHOICE: 'Single Choice',
  MULTIPLE_CHOICE: 'Multiple Choice',
  TRUE_FALSE: 'True/False',
  MATCHING: 'Matching',
  FILL_BLANK: 'Fill in Blank',
  ORDERING: 'Ordering',
  ESSAY: 'Essay',
  CODE: 'Code',
  DIAGRAM: 'Diagram',
};
const DIFFICULTY_LABELS: Record<string, string> = { EASY: 'Easy', MEDIUM: 'Medium', HARD: 'Hard' };
const STATUS_LABELS: Record<string, string> = QUESTION_STATUS_LABELS;

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
/** Q-01 groupType: the kind of the group a question is in, or NONE for standalone questions. */
const GROUP_TYPE_OPTIONS = toOptions('All Formats', {
  NONE: 'Standalone (no group)',
  ...Object.fromEntries(Object.entries(GROUP_KIND_LABELS).map(([k, label]) => [k, `${label} group`])),
});

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
  const toast = useToast();

  const [query, setQuery] = useState('');
  const [course, setCourse] = useState(ALL);
  const [module, setModule] = useState(ALL);
  const [groupType, setGroupType] = useState(ALL);
  const [type, setType] = useState(ALL);
  const [difficulty, setDifficulty] = useState(ALL);
  const [status, setStatus] = useState(ALL);
  const [page, setPage] = useState(1);
  const debouncedQuery = useDebounce(query.trim(), 400);

  const [courses, setCourses] = useState<CourseSummaryItem[] | null>(null);
  const [modules, setModules] = useState<CourseModuleResponse[]>([]);
  /** Admins see every course; a course manager's "All Courses" means the courses assigned to them. */
  const isAdmin = getUserRoleCode() === 'ADMIN';

  const [result, setResult] = useState<QuestionPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  // Course options (the caller's courses) load once; module options follow the selected course.
  useEffect(() => {
    let cancelled = false;
    courseService.getCourses({ size: 100 })
      .then(res => { if (!cancelled) setCourses(res.content); })
      .catch(() => { if (!cancelled) setCourses([]); });
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

  // "All Courses" for a manager = only their assigned courses (Q-01 courseIds).
  const scopeCourseIds = !isAdmin && course === ALL && courses ? courses.map(c => c.courseId) : undefined;
  const scopeKey = scopeCourseIds?.join(',');
  const notAssigned = !isAdmin && courses !== null && courses.length === 0;

  useEffect(() => {
    // Wait for the manager's courses before asking for "All Courses".
    if (!isAdmin && course === ALL && courses === null) return;
    if (notAssigned) {
      setResult({ content: [], page: 0, size: PAGE_SIZE, totalElements: 0, totalPages: 0 });
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    questionService
      .getQuestions({
        search: debouncedQuery || undefined,
        courseId: optionalNumber(course),
        courseIds: scopeCourseIds,
        moduleId: optionalNumber(module),
        groupType: optionalString(groupType),
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
    // scopeKey stands in for scopeCourseIds (a new array every render).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedQuery, course, module, groupType, type, difficulty, status, page, reloadKey, scopeKey, notAssigned]);

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
  // A group holds one kind, so a group type narrows the question types to that kind.
  const groupKind = groupType === ALL || groupType === 'NONE' ? null : asGroupKind(groupType);
  const typeOptions = TYPE_OPTIONS.filter(o => o.value === ALL || !groupKind || kindOf(o.value) === groupKind);
  const changeGroupType = (v: string) => {
    setGroupType(v);
    const kind = v === ALL || v === 'NONE' ? null : asGroupKind(v);
    if (kind && type !== ALL && kindOf(type) !== kind) setType(ALL);
    setPage(1);
  };
  const changeQuery = (v: string) => {
    setQuery(v);
    setPage(1);
  };

  const rows: Row[] = (result?.content ?? []).map(q => ({ ...q, id: q.questionId }));

  const [statusBusyId, setStatusBusyId] = useState<number | null>(null);
  const changeStatus = async (q: Row, next: QuestionStatus) => {
    setStatusBusyId(q.questionId);
    try {
      await questionService.updateQuestionStatus(q.questionId, next, q.lockVersion);
      toast.success(next === 'ACTIVE' ? 'Question published.' : 'Question archived.');
      // Refetch so the row reflects the new status and still matches the active filter.
      setReloadKey(k => k + 1);
    } catch (err) {
      toast.error(err instanceof Error && err.message ? err.message : 'Could not change the status.');
    } finally {
      setStatusBusyId(null);
    }
  };

  /** Question waiting for a confirmation to replace the unsaved New Questions draft. */
  const [confirmDuplicate, setConfirmDuplicate] = useState<number | null>(null);
  /** Opens New Questions prefilled with a copy — the copy is only saved from there. */
  const duplicate = (q: Row) => {
    const draft = loadCreateDraft();
    if (draft?.questions.some(d => d.content.trim() !== '')) setConfirmDuplicate(q.questionId);
    else navigate(managerQuestionDuplicatePath(q.questionId));
  };

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
        return <Badge variant={TYPE_VARIANT[t] ?? 'info'} className="whitespace-nowrap">{TYPE_LABELS[t] ?? t}</Badge>;
      },
    },
    {
      key: 'groupId',
      label: 'Format',
      render: r => {
        const { groupId, questionType } = asRow(r);
        // A group holds one kind of question, so the question's own kind is the group's.
        const kind = kindOf(questionType);
        const label = kind ? GROUP_KIND_LABELS[kind] : 'Group';
        return groupId != null ? (
          <span title={`Part of ${label.toLowerCase()} group #${groupId} (shares one passage)`}>
            <Badge variant="purple" className="whitespace-nowrap"><Icon.Layers className="w-3 h-3" /> {label} #{groupId}</Badge>
          </span>
        ) : (
          <Badge variant="default" className="whitespace-nowrap">Single</Badge>
        );
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
    {
      key: 'actions',
      label: '',
      width: '48px',
      render: r => {
        const q = asRow(r);
        const published = q.status === 'ACTIVE';
        return (
          // The menu is portalled, but React events still bubble to the row's onClick.
          <div onClick={e => e.stopPropagation()}>
            <Dropdown
              trigger={
                <button
                  type="button"
                  aria-label="Question actions"
                  disabled={statusBusyId === q.questionId}
                  className="p-1.5 hover:bg-accent rounded-[6px] disabled:opacity-50"
                >
                  <Icon.MoreHorizontal className="w-4 h-4 text-content-soft" />
                </button>
              }
              items={[
                { label: 'Detail', icon: <Icon.Eye />, onClick: () => navigate(managerQuestionEditPath(q.questionId)) },
                { label: 'Duplicate', icon: <Icon.Copy />, onClick: () => duplicate(q) },
                // Published questions can be archived; Draft and Archived ones can be published.
                published
                  ? { label: 'Archive', icon: <Icon.Package />, danger: true, onClick: () => changeStatus(q, 'INACTIVE') }
                  : { label: 'Publish', icon: <Icon.CheckCircle />, onClick: () => changeStatus(q, 'ACTIVE') },
              ]}
            />
          </div>
        );
      },
    },
  ];

  const filtersActive = query !== '' || [course, module, groupType, type, difficulty, status].some(v => v !== ALL);
  const clearFilters = () => {
    setQuery('');
    setCourse(ALL);
    setModule(ALL);
    setGroupType(ALL);
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

      {/* Search on its own row, then the six filters in two even rows, Clear at the bottom right */}
      <div className="card px-4 py-4 space-y-3">
        <SearchInput
          className="w-full"
          placeholder="Search questions…"
          value={query}
          onChange={e => changeQuery(e.target.value)}
          aria-label="Search questions"
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <SearchableSelect
            label="Course"
            value={course}
            onChange={changeCourse}
            options={[{ label: 'All Courses', value: ALL }, ...(courses ?? []).map(c => ({ label: c.title, value: String(c.courseId) }))]}
            searchPlaceholder="Search courses…"
            emptyText="No courses match"
          />
          <Select
            label="Module"
            value={module}
            onChange={filterSetter(setModule)}
            disabled={course === ALL}
            options={[
              { label: course === ALL ? 'Select a course first' : 'All Modules', value: ALL },
              ...modules.map(m => ({ label: m.title, value: String(m.moduleId) })),
            ]}
          />
          <Select label="Group type" value={groupType} onChange={changeGroupType} options={GROUP_TYPE_OPTIONS} />
          <Select label="Question type" value={type} onChange={filterSetter(setType)} options={typeOptions} />
          <Select label="Difficulty" value={difficulty} onChange={filterSetter(setDifficulty)} options={DIFFICULTY_OPTIONS} />
          <Select label="Status" value={status} onChange={filterSetter(setStatus)} options={STATUS_OPTIONS} />
        </div>
        {filtersActive && (
          <div className="flex justify-end">
            <button type="button" onClick={clearFilters} className="inline-flex items-center gap-1 whitespace-nowrap text-sm font-medium text-brand-ink hover:underline">
              <Icon.X className="w-3.5 h-3.5" /> Clear filters
            </button>
          </div>
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
          perPage={PAGE_SIZE}
          unit="questions"
          serverPagination={{ page, total: result?.totalElements ?? 0, onChange: setPage }}
          onRowClick={r => navigate(managerQuestionEditPath(asRow(r).questionId))}
          emptyState={
            loading ? 'Loading questions…'
              : error ? null
              : filtersActive ? 'No questions match your filters.'
              : notAssigned ? 'You are not assigned to any course yet, so there are no questions to show.'
              : 'No questions yet. Click “Add Question” to create one.'
          }
        />
      </div>

      <Modal
        open={confirmDuplicate != null}
        onClose={() => setConfirmDuplicate(null)}
        title="Replace your unsaved draft?"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmDuplicate(null)}>Cancel</Button>
            <Button variant="danger" onClick={() => { if (confirmDuplicate != null) navigate(managerQuestionDuplicatePath(confirmDuplicate)); setConfirmDuplicate(null); }}>
              Discard &amp; duplicate
            </Button>
          </>
        }
      >
        <p className="text-sm text-content-secondary">
          You have new questions that haven’t been saved yet. Duplicating this question replaces them. Save them first if you want to keep them.
        </p>
      </Modal>
    </div>
  );
}
