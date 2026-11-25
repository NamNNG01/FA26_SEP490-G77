import React, { useEffect, useState } from 'react';
import { useQuietRefresh } from '@/hooks/useAutoRefresh';
import { useNavigate } from 'react-router';
import { questionPlainText } from '@/components/common/QuestionContent';
import { Button } from '@/components/ui/Button';
import { Badge, type BadgeVariant } from '@/components/ui/Badge';
import { Select } from '@/components/ui/Select';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import { Table, type TableColumn } from '@/components/ui/Table';
import { Alert } from '@/components/ui/Alert';
import { Dropdown } from '@/components/ui/Dropdown';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Pagination } from '@/components/ui/Pagination';
import { Spinner } from '@/components/ui/Spinner';
import { useToast } from '@/components/ui/ToastHost';
import { SearchInput } from '@/components/common/SearchInput';
import { Icon } from '@/assets/icons';
import { useDebounce } from '@/hooks';
import {
  ROUTES,
  managerQuestionCreateWithContextPath,
  managerQuestionDuplicatePath,
  managerQuestionEditPath,
} from '@/app/routes';
import { courseService, type CourseModuleResponse, type CourseSummaryItem } from '@/services/course.service';
import { getUserRoleCode } from '@/auth/storage';
import {
  QUESTION_STATUS_LABELS,
  questionService,
  type QuestionListItem,
  type QuestionPage,
} from '@/services/question.service';
import { questionGroupService, type QuestionGroup } from '@/services/questionGroup.service';
import { GROUP_KIND_LABELS, GROUP_KIND_OPTIONS, asGroupKind, kindOf } from '../model';
import { loadCreateDraft } from '../createDraft';
import { groupLabel } from '../components/QuestionGroupPicker';
import { NewGroupModal } from '../components/NewGroupModal';

const PAGE_SIZE = 10;
const ALL = 'all';

type BankTab = 'questions' | 'groups';
type GroupPublishFilter = 'all' | 'PUBLISHED' | 'PARTIAL' | 'DRAFT';

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
  DIAGRAM_ESSAY: 'Diagram + Essay',
};
const DIFFICULTY_LABELS: Record<string, string> = { EASY: 'Easy', MEDIUM: 'Medium', HARD: 'Hard' };
const STATUS_LABELS: Record<string, string> = QUESTION_STATUS_LABELS;

const TYPE_VARIANT: Record<string, BadgeVariant> = {
  ESSAY: 'purple',
  TRUE_FALSE: 'success',
  CODE: 'warning',
  DIAGRAM: 'warning',
  DIAGRAM_ESSAY: 'purple',
};
const DIFFICULTY_VARIANT: Record<string, BadgeVariant> = { EASY: 'success', MEDIUM: 'warning', HARD: 'danger' };
const STATUS_VARIANT: Record<string, BadgeVariant> = { INACTIVE: 'default', ACTIVE: 'success', ARCHIVED: 'danger' };

const toOptions = (allLabel: string, labels: Record<string, string>) => [
  { label: allLabel, value: ALL },
  ...Object.entries(labels).map(([value, label]) => ({ label, value })),
];
const TYPE_OPTIONS = toOptions('All Types', TYPE_LABELS);
const DIFFICULTY_OPTIONS = toOptions('All Difficulty', DIFFICULTY_LABELS);
const STATUS_OPTIONS = toOptions('All Status', STATUS_LABELS);
const GROUP_KIND_FILTER_OPTIONS = [
  { label: 'All Group Types', value: ALL },
  ...GROUP_KIND_OPTIONS.map(o => ({ label: o.label, value: o.value })),
];
const GROUP_PUBLISH_OPTIONS: { label: string; value: GroupPublishFilter }[] = [
  { label: 'All Publish States', value: 'all' },
  { label: 'Published', value: 'PUBLISHED' },
  { label: 'Partially Published', value: 'PARTIAL' },
  { label: 'Draft (Unpublished)', value: 'DRAFT' },
];
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

function groupPublishState(g: QuestionGroup): {
  kind: 'PUBLISHED' | 'PARTIAL' | 'DRAFT';
  label: string;
  variant: BadgeVariant;
  pub: number;
  draft: number;
  total: number;
} {
  const total = g.questionCount ?? 0;
  const pub = g.publishedQuestionCount ?? 0;
  const draft = g.draftQuestionCount ?? Math.max(0, total - pub);
  if (total > 0 && pub >= total) {
    return { kind: 'PUBLISHED', label: `Published (${pub}/${total})`, variant: 'success', pub, draft, total };
  }
  if (pub > 0) {
    return { kind: 'PARTIAL', label: `Partially Published (${pub}/${total})`, variant: 'warning', pub, draft, total };
  }
  return { kind: 'DRAFT', label: `Draft (0/${total} published)`, variant: 'default', pub, draft, total };
}

type Row = QuestionListItem & { id: number };
const asRow = (r: Record<string, unknown>) => r as unknown as Row;

export function QuestionBankPage() {
  const navigate = useNavigate();
  const toast = useToast();

  const [activeTab, setActiveTab] = useState<BankTab>('questions');

  // Shared course & module filters
  const [course, setCourse] = useState(ALL);
  const [module, setModule] = useState(ALL);
  const [courses, setCourses] = useState<CourseSummaryItem[] | null>(null);
  const [modules, setModules] = useState<CourseModuleResponse[]>([]);
  const isAdmin = getUserRoleCode() === 'ADMIN';

  // Questions tab state
  const [query, setQuery] = useState('');
  const [groupType, setGroupType] = useState(ALL);
  const [type, setType] = useState(ALL);
  const [difficulty, setDifficulty] = useState(ALL);
  const [status, setStatus] = useState(ALL);
  const [page, setPage] = useState(1);
  const debouncedQuery = useDebounce(query.trim(), 400);

  const [result, setResult] = useState<QuestionPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const takeQuiet = useQuietRefresh(() => setReloadKey(k => k + 1));

  // Question Groups tab state
  const [groupSearch, setGroupSearch] = useState('');
  const debouncedGroupSearch = useDebounce(groupSearch.trim(), 400);
  const [groupKindFilter, setGroupKindFilter] = useState(ALL);
  const [groupPublishFilter, setGroupPublishFilter] = useState<GroupPublishFilter>('all');
  const [groupPage, setGroupPage] = useState(1);
  const [groups, setGroups] = useState<QuestionGroup[]>([]);
  const [groupsTotal, setGroupsTotal] = useState(0);
  const [groupsLoading, setGroupsLoading] = useState(false);
  const [groupsError, setGroupsError] = useState<string | null>(null);
  const [groupsReloadKey, setGroupsReloadKey] = useState(0);
  const [expandedGroupIds, setExpandedGroupIds] = useState<Set<number>>(() => new Set());
  const [groupMembers, setGroupMembers] = useState<Record<number, { loading: boolean; items: QuestionListItem[]; error?: string }>>({});

  // Confirmations & modals
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [confirmPublishIds, setConfirmPublishIds] = useState<number[] | null>(null);
  const [confirmPublishGroup, setConfirmPublishGroup] = useState<QuestionGroup | null>(null);
  const [publishingGroup, setPublishingGroup] = useState(false);
  const [editGroupTarget, setEditGroupTarget] = useState<QuestionGroup | null>(null);
  const [deleteGroupTarget, setDeleteGroupTarget] = useState<QuestionGroup | null>(null);
  const [deletingGroup, setDeletingGroup] = useState(false);

  /** Pending target URL when navigating to New Questions would overwrite an unsaved draft. */
  const [confirmReplacePath, setConfirmReplacePath] = useState<string | null>(null);

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

  const notAssigned = !isAdmin && courses !== null && courses.length === 0;

  // Fetch Questions tab
  useEffect(() => {
    if (activeTab !== 'questions') return;
    if (notAssigned) {
      setResult({ content: [], page: 0, size: PAGE_SIZE, totalElements: 0, totalPages: 0 });
      setLoading(false);
      return;
    }
    let cancelled = false;
    const quiet = takeQuiet();
    if (!quiet) {
      setLoading(true);
      setError(null);
      setSelected(new Set());
    }
    questionService
      .getQuestions({
        search: debouncedQuery || undefined,
        courseId: optionalNumber(course),
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
        if (res.totalPages > 0 && page > res.totalPages) setPage(res.totalPages);
      })
      .catch((err: Error) => {
        if (!cancelled && !quiet) setError(err.message || 'Could not load questions.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, debouncedQuery, course, module, groupType, type, difficulty, status, page, reloadKey, notAssigned]);

  // Fetch Question Groups tab
  useEffect(() => {
    if (activeTab !== 'groups') return;
    if (notAssigned) {
      setGroups([]);
      setGroupsTotal(0);
      setGroupsLoading(false);
      return;
    }
    let cancelled = false;
    setGroupsLoading(true);
    setGroupsError(null);
    const clientFiltering = groupPublishFilter !== 'all';
    questionGroupService
      .getQuestionGroups({
        courseId: optionalNumber(course),
        moduleId: optionalNumber(module),
        questionType: optionalString(groupKindFilter),
        search: debouncedGroupSearch || undefined,
        page: clientFiltering ? 0 : groupPage - 1,
        size: clientFiltering ? 100 : PAGE_SIZE,
      })
      .then(res => {
        if (cancelled) return;
        if (clientFiltering) {
          const filtered = res.content.filter(g => groupPublishState(g).kind === groupPublishFilter);
          setGroups(filtered);
          setGroupsTotal(filtered.length);
        } else {
          setGroups(res.content);
          setGroupsTotal(res.totalElements);
        }
      })
      .catch((err: Error) => {
        if (!cancelled) setGroupsError(err.message || 'Could not load question groups.');
      })
      .finally(() => {
        if (!cancelled) setGroupsLoading(false);
      });
    return () => { cancelled = true; };
  }, [activeTab, course, module, groupKindFilter, groupPublishFilter, debouncedGroupSearch, groupPage, groupsReloadKey, notAssigned]);

  const loadGroupMembers = (groupId: number) => {
    setGroupMembers(prev => ({ ...prev, [groupId]: { loading: true, items: prev[groupId]?.items ?? [] } }));
    questionService
      .getQuestions({ groupId, size: 100 })
      .then(res => {
        setGroupMembers(prev => ({ ...prev, [groupId]: { loading: false, items: res.content } }));
      })
      .catch((err: Error) => {
        setGroupMembers(prev => ({
          ...prev,
          [groupId]: { loading: false, items: prev[groupId]?.items ?? [], error: err.message || 'Could not load group questions.' },
        }));
      });
  };

  const toggleGroupExpand = (groupId: number) => {
    setExpandedGroupIds(prev => {
      const next = new Set(prev);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
        loadGroupMembers(groupId);
      }
      return next;
    });
  };

  const filterSetter = (setter: (v: string) => void) => (v: string) => {
    setter(v);
    setPage(1);
  };
  const changeCourse = (v: string) => {
    setCourse(v);
    setModule(ALL);
    setPage(1);
    setGroupPage(1);
  };
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

  /** Navigates to New Questions with explicit context; confirms first if there is real unsaved draft work. */
  const openCreateWithIntent = (path: string) => {
    const draft = loadCreateDraft();
    if (draft) setConfirmReplacePath(path);
    else navigate(path);
  };

  const rows: Row[] = (result?.content ?? []).map(q => ({ ...q, id: q.questionId }));
  const selectedRows = rows.filter(r => selected.has(String(r.id)));
  const selectedDrafts = selectedRows.filter(r => r.status === 'INACTIVE');
  const canBulkPublish = selectedDrafts.length > 0;
  const bulkHint = selectedRows.length === 0
    ? null
    : selectedDrafts.length === 0
      ? 'All selected questions are already Published.'
      : selectedDrafts.length < selectedRows.length
        ? `${selectedDrafts.length} of ${selectedRows.length} selected are Drafts.`
        : null;

  const publishQuestions = async (ids: number[]) => {
    setBulkBusy(true);
    try {
      await questionService.batchUpdateStatus(ids, 'ACTIVE');
      toast.success(`${ids.length} question${ids.length === 1 ? '' : 's'} published.`);
      setConfirmPublishIds(null);
      setReloadKey(k => k + 1);
      setGroupsReloadKey(k => k + 1);
      expandedGroupIds.forEach(gid => loadGroupMembers(gid));
    } catch (err) {
      toast.error(err instanceof Error && err.message ? err.message : 'Could not publish the questions.');
    } finally {
      setBulkBusy(false);
    }
  };

  const publishGroupNow = async () => {
    if (!confirmPublishGroup) return;
    const gid = confirmPublishGroup.groupId;
    setPublishingGroup(true);
    try {
      const updated = await questionGroupService.publishGroup(gid);
      toast.success(`Published all questions in “${groupLabel(updated)}”.`);
      setGroups(prev => prev.map(g => (g.groupId === gid ? updated : g)));
      setConfirmPublishGroup(null);
      setGroupsReloadKey(k => k + 1);
      setReloadKey(k => k + 1);
      if (expandedGroupIds.has(gid)) loadGroupMembers(gid);
    } catch (err) {
      toast.error(err instanceof Error && err.message ? err.message : 'Could not publish this question group.');
    } finally {
      setPublishingGroup(false);
    }
  };

  const deleteGroupNow = async () => {
    if (!deleteGroupTarget) return;
    const gid = deleteGroupTarget.groupId;
    setDeletingGroup(true);
    try {
      await questionGroupService.deleteQuestionGroup(gid);
      toast.success(`Deleted question group “${groupLabel(deleteGroupTarget)}”. Its questions are now standalone.`);
      setDeleteGroupTarget(null);
      setGroupsReloadKey(k => k + 1);
      setReloadKey(k => k + 1);
    } catch (err) {
      toast.error(err instanceof Error && err.message ? err.message : 'Could not delete the question group.');
    } finally {
      setDeletingGroup(false);
    }
  };

  const jumpToGroup = (q: Row) => {
    if (q.groupId == null) return;
    setActiveTab('groups');
    setGroupSearch(q.groupTitle?.trim() || '');
    setGroupPage(1);
    setExpandedGroupIds(prev => new Set(prev).add(q.groupId!));
    loadGroupMembers(q.groupId);
  };

  const columns: TableColumn[] = [
    {
      key: 'content',
      label: 'Question',
      width: '36%',
      render: r => (
        <p className="text-sm font-medium text-content line-clamp-2 whitespace-normal" title={questionPlainText(asRow(r).content)}>
          {questionPlainText(asRow(r).content)}
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
        const q = asRow(r);
        const kind = kindOf(q.questionType);
        const label = kind ? GROUP_KIND_LABELS[kind] : 'Group';
        return q.groupId != null ? (
          <button
            type="button"
            onClick={e => { e.stopPropagation(); jumpToGroup(q); }}
            title={`View ${label.toLowerCase()} group “${q.groupTitle || `#${q.groupId}`}”`}
            className="text-left hover:opacity-80 transition-opacity"
          >
            <Badge variant="purple" className="max-w-[190px]">
              <Icon.Layers className="w-3 h-3 flex-shrink-0" />
              <span className="truncate">{q.groupTitle?.trim() || `${label} #${q.groupId}`}</span>
            </Badge>
          </button>
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
        const items = [
          { label: 'Detail', icon: <Icon.Eye />, onClick: () => navigate(managerQuestionEditPath(q.questionId)) },
          ...(q.status === 'INACTIVE'
            ? [{ label: 'Publish', icon: <Icon.Upload />, onClick: () => setConfirmPublishIds([q.questionId]) }]
            : []),
          { label: 'Duplicate', icon: <Icon.Copy />, onClick: () => openCreateWithIntent(managerQuestionDuplicatePath(q.questionId)) },
        ];
        return (
          <div onClick={e => e.stopPropagation()}>
            <Dropdown
              trigger={
                <button
                  type="button"
                  aria-label="Question actions"
                  className="p-1.5 hover:bg-accent rounded-[6px]"
                >
                  <Icon.MoreHorizontal className="w-4 h-4 text-content-soft" />
                </button>
              }
              items={items}
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

  const groupFiltersActive = groupSearch !== '' || course !== ALL || module !== ALL || groupKindFilter !== ALL || groupPublishFilter !== 'all';
  const clearGroupFilters = () => {
    setGroupSearch('');
    setCourse(ALL);
    setModule(ALL);
    setGroupKindFilter(ALL);
    setGroupPublishFilter('all');
    setGroupPage(1);
  };

  const displayedGroups = groupPublishFilter !== 'all'
    ? groups.slice((groupPage - 1) * PAGE_SIZE, groupPage * PAGE_SIZE)
    : groups;

  return (
    <div className="p-8 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-bold text-content">Question Bank</h2>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            icon={<Icon.Layers className="w-4 h-4" />}
            onClick={() => openCreateWithIntent(managerQuestionCreateWithContextPath({
              context: 'new-group',
              courseId: optionalNumber(course),
              moduleId: optionalNumber(module),
            }))}
          >
            New Question Group
          </Button>
          <Button
            icon={<Icon.Plus className="w-4 h-4" />}
            onClick={() => navigate(
              loadCreateDraft()
                ? ROUTES.managerQuestionCreate
                : managerQuestionCreateWithContextPath({
                  courseId: optionalNumber(course),
                  moduleId: optionalNumber(module),
                }),
            )}
          >
            Add Question
          </Button>
        </div>
      </div>

      {/* Main view tabs: Questions vs Question Groups */}
      <div className="inline-flex rounded-[10px] bg-surface-muted p-1 gap-1" role="tablist" aria-label="Question bank sections">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'questions'}
          onClick={() => setActiveTab('questions')}
          className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-[8px] text-sm font-medium transition-all ${
            activeTab === 'questions' ? 'bg-surface text-content shadow-sm' : 'text-content-soft hover:text-content-secondary'
          }`}
        >
          <Icon.FileText className="w-4 h-4" /> Questions
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'groups'}
          onClick={() => setActiveTab('groups')}
          className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-[8px] text-sm font-medium transition-all ${
            activeTab === 'groups' ? 'bg-surface text-content shadow-sm' : 'text-content-soft hover:text-content-secondary'
          }`}
        >
          <Icon.Layers className="w-4 h-4" /> Question Groups
        </button>
      </div>

      {activeTab === 'questions' ? (
        <>
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
              <SearchableSelect
                label="Module"
                value={module}
                onChange={v => { setModule(v); setPage(1); setGroupPage(1); }}
                disabled={course === ALL}
                placeholder={course === ALL ? 'Select a course first' : 'All Modules'}
                searchPlaceholder="Search modules…"
                emptyText="No modules found"
                options={[
                  { label: course === ALL ? 'Select a course first' : 'All Modules', value: ALL },
                  ...modules.map(m => ({ label: m.title, value: String(m.moduleId) })),
                ]}
              />
              <Select label="Format" value={groupType} onChange={changeGroupType} options={GROUP_TYPE_OPTIONS} />
              <Select label="Question type" value={type} onChange={filterSetter(setType)} options={typeOptions} />
              <Select label="Difficulty" value={difficulty} onChange={filterSetter(setDifficulty)} options={DIFFICULTY_OPTIONS} />
              <Select label="Status" value={status} onChange={filterSetter(setStatus)} options={STATUS_OPTIONS} />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <div className="flex flex-wrap items-center gap-1.5">
                {([
                  { value: ALL, label: 'All' },
                  { value: 'INACTIVE', label: 'Draft (Unpublished)' },
                  { value: 'ACTIVE', label: 'Published' },
                ] as const).map(pill => (
                  <button
                    key={pill.value}
                    type="button"
                    onClick={() => filterSetter(setStatus)(pill.value)}
                    className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                      status === pill.value
                        ? 'border-brand-600 bg-brand-600/10 text-brand-ink'
                        : 'border-line text-content-soft hover:text-content'
                    }`}
                  >
                    {pill.label}
                  </button>
                ))}
              </div>
              {filtersActive && (
                <button type="button" onClick={clearFilters} className="inline-flex items-center gap-1 whitespace-nowrap text-sm font-medium text-brand-ink hover:underline">
                  <Icon.X className="w-3.5 h-3.5" /> Clear filters
                </button>
              )}
            </div>
          </div>

          {error && (
            <div className="space-y-2">
              <Alert type="error" title="Could not load questions" message={error} />
              <Button variant="secondary" size="sm" onClick={() => setReloadKey(k => k + 1)}>Try again</Button>
            </div>
          )}

          <div className={`card overflow-hidden transition-opacity ${loading && result ? 'opacity-60' : ''}`} aria-busy={loading}>
            {selectedRows.length > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-line-soft bg-primary-light">
                <div className="flex items-center gap-3 text-sm">
                  <span className="font-medium text-content">{selectedRows.length} selected</span>
                  <button type="button" onClick={() => setSelected(new Set())} className="text-brand-ink hover:underline">Clear</button>
                </div>
                <div className="flex flex-wrap items-center justify-end gap-3">
                  {bulkHint && <span className="text-xs text-content-soft">{bulkHint}</span>}
                  <Button
                    size="sm"
                    icon={<Icon.Upload className="w-4 h-4" />}
                    disabled={!canBulkPublish || bulkBusy}
                    onClick={() => setConfirmPublishIds(selectedDrafts.map(r => r.questionId))}
                  >
                    Publish Drafts ({selectedDrafts.length})
                  </Button>
                </div>
              </div>
            )}
            <Table
              columns={columns}
              selectable
              selectedKeys={selected}
              onSelectionChange={setSelected}
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
        </>
      ) : (
        <>
          {/* Question Groups tab */}
          <div className="card px-4 py-4 space-y-3">
            <SearchInput
              className="w-full"
              placeholder="Search group title or passage…"
              value={groupSearch}
              onChange={e => { setGroupSearch(e.target.value); setGroupPage(1); }}
              aria-label="Search question groups"
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <SearchableSelect
                label="Course"
                value={course}
                onChange={changeCourse}
                options={[{ label: 'All Courses', value: ALL }, ...(courses ?? []).map(c => ({ label: c.title, value: String(c.courseId) }))]}
                searchPlaceholder="Search courses…"
                emptyText="No courses match"
              />
              <SearchableSelect
                label="Module"
                value={module}
                onChange={v => { setModule(v); setGroupPage(1); setPage(1); }}
                disabled={course === ALL}
                placeholder={course === ALL ? 'Select a course first' : 'All Modules'}
                searchPlaceholder="Search modules…"
                emptyText="No modules found"
                options={[
                  { label: course === ALL ? 'Select a course first' : 'All Modules', value: ALL },
                  ...modules.map(m => ({ label: m.title, value: String(m.moduleId) })),
                ]}
              />
              <Select
                label="Group type"
                value={groupKindFilter}
                onChange={v => { setGroupKindFilter(v); setGroupPage(1); }}
                options={GROUP_KIND_FILTER_OPTIONS}
              />
              <Select
                label="Publish status"
                value={groupPublishFilter}
                onChange={v => { setGroupPublishFilter(v as GroupPublishFilter); setGroupPage(1); }}
                options={GROUP_PUBLISH_OPTIONS}
              />
            </div>
            {groupFiltersActive && (
              <div className="flex justify-end">
                <button type="button" onClick={clearGroupFilters} className="inline-flex items-center gap-1 whitespace-nowrap text-sm font-medium text-brand-ink hover:underline">
                  <Icon.X className="w-3.5 h-3.5" /> Clear filters
                </button>
              </div>
            )}
          </div>

          {groupsError && (
            <div className="space-y-2">
              <Alert type="error" title="Could not load question groups" message={groupsError} />
              <Button variant="secondary" size="sm" onClick={() => setGroupsReloadKey(k => k + 1)}>Try again</Button>
            </div>
          )}

          <div className="space-y-3" aria-busy={groupsLoading}>
            {groupsLoading && groups.length === 0 ? (
              <div className="card p-10 flex items-center justify-center gap-2 text-content-soft">
                <Spinner size="sm" /> Loading question groups…
              </div>
            ) : displayedGroups.length === 0 ? (
              <div className="card p-10 text-center space-y-2">
                <p className="text-base font-medium text-content-secondary">
                  {groupFiltersActive ? 'No question groups match your filters.' : 'No question groups yet'}
                </p>
                <p className="text-sm text-content-subtle">
                  Click “New Question Group” above to create a shared passage with questions.
                </p>
              </div>
            ) : (
              displayedGroups.map(g => {
                const expanded = expandedGroupIds.has(g.groupId);
                const state = groupPublishState(g);
                const kind = asGroupKind(g.questionType);
                const memberState = groupMembers[g.groupId];
                return (
                  <article key={g.groupId} className="card overflow-hidden">
                    <div className="p-4 flex flex-wrap items-start justify-between gap-3">
                      <button
                        type="button"
                        onClick={() => toggleGroupExpand(g.groupId)}
                        className="flex-1 min-w-0 text-left flex items-start gap-2.5 group"
                        aria-expanded={expanded}
                      >
                        <Icon.ChevronDown className={`w-4 h-4 mt-1 text-content-subtle flex-shrink-0 transition-transform ${expanded ? 'rotate-180' : ''}`} />
                        <div className="min-w-0 space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="text-base font-semibold text-content group-hover:text-brand-ink transition-colors">
                              {groupLabel(g)}
                            </h3>
                            {kind && <Badge variant="purple">{GROUP_KIND_LABELS[kind]}</Badge>}
                            <Badge variant={state.variant}>{state.label}</Badge>
                          </div>
                          <div className="flex flex-wrap items-center gap-2 text-xs text-content-subtle">
                            {g.courseName && <span>{g.courseName}</span>}
                            {g.moduleName && <span>· {g.moduleName}</span>}
                            <span>· {state.total} question{state.total === 1 ? '' : 's'}</span>
                          </div>
                        </div>
                      </button>

                      <div className="flex flex-wrap items-center gap-2 flex-shrink-0">
                        <Button
                          size="sm"
                          variant="outline"
                          icon={<Icon.Plus className="w-3.5 h-3.5" />}
                          onClick={() => openCreateWithIntent(managerQuestionCreateWithContextPath({
                            groupId: g.groupId,
                            courseId: g.courseId,
                            moduleId: g.moduleId,
                          }))}
                        >
                          Add Question
                        </Button>
                        {state.draft > 0 && (
                          <Button
                            size="sm"
                            variant="secondary"
                            icon={<Icon.Upload className="w-3.5 h-3.5" />}
                            onClick={() => setConfirmPublishGroup(g)}
                          >
                            Publish Group ({state.draft})
                          </Button>
                        )}
                        <Dropdown
                          trigger={
                            <button
                              type="button"
                              aria-label={`Actions for ${groupLabel(g)}`}
                              className="p-1.5 hover:bg-accent rounded-[6px]"
                            >
                              <Icon.MoreHorizontal className="w-4 h-4 text-content-soft" />
                            </button>
                          }
                          items={[
                            { label: 'Edit Passage', icon: <Icon.Edit />, onClick: () => setEditGroupTarget(g) },
                            {
                              label: expanded ? 'Hide Questions' : 'View Questions',
                              icon: <Icon.Eye />,
                              onClick: () => toggleGroupExpand(g.groupId),
                            },
                            { label: 'Delete Group', icon: <Icon.Trash />, danger: true, onClick: () => setDeleteGroupTarget(g) },
                          ]}
                        />
                      </div>
                    </div>

                    {expanded && (
                      <div className="border-t border-line-soft bg-surface-alt/30 p-4 space-y-3">
                        <div className="rounded-[10px] border border-line bg-surface p-3">
                          <p className="text-xs font-semibold uppercase tracking-wide text-content-subtle mb-1">Shared passage</p>
                          <div className="max-h-[200px] overflow-y-auto text-sm text-content-secondary whitespace-pre-wrap">
                            {g.passageText?.trim() || <span className="italic text-content-subtle">No passage text.</span>}
                          </div>
                        </div>

                        <div className="space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <h4 className="text-sm font-semibold text-content">Questions in this group</h4>
                            <Button
                              size="sm"
                              variant="ghost"
                              icon={<Icon.Plus className="w-3.5 h-3.5" />}
                              onClick={() => openCreateWithIntent(managerQuestionCreateWithContextPath({
                                groupId: g.groupId,
                                courseId: g.courseId,
                                moduleId: g.moduleId,
                              }))}
                            >
                              Add Question to this Group
                            </Button>
                          </div>

                          {memberState?.loading ? (
                            <div className="py-6 flex items-center justify-center gap-2 text-sm text-content-soft">
                              <Spinner size="sm" /> Loading questions…
                            </div>
                          ) : memberState?.error ? (
                            <Alert type="error" title="Could not load group questions" message={memberState.error} />
                          ) : !memberState?.items.length ? (
                            <p className="text-sm text-content-subtle py-3">No questions in this group yet.</p>
                          ) : (
                            <div className="divide-y divide-line-faint rounded-[10px] border border-line bg-surface overflow-hidden">
                              {memberState.items.map((item, idx) => {
                                const isDraft = item.status === 'INACTIVE';
                                return (
                                  <div
                                    key={item.questionId}
                                    onClick={() => navigate(managerQuestionEditPath(item.questionId))}
                                    className="px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-3 hover:bg-surface-hover cursor-pointer transition-colors"
                                  >
                                    <div className="min-w-0 flex-1 flex items-start gap-2.5">
                                      <span className="min-w-6 h-6 px-1 rounded-[6px] bg-brand-600/10 text-brand-ink flex items-center justify-center text-xs font-bold flex-shrink-0">
                                        #{idx + 1}
                                      </span>
                                      <p className="text-sm text-content line-clamp-2">{questionPlainText(item.content)}</p>
                                    </div>
                                    <div className="flex flex-wrap items-center gap-2 flex-shrink-0" onClick={e => e.stopPropagation()}>
                                      <Badge variant={TYPE_VARIANT[item.questionType] ?? 'info'}>
                                        {TYPE_LABELS[item.questionType] ?? item.questionType}
                                      </Badge>
                                      {item.difficulty && (
                                        <Badge variant={DIFFICULTY_VARIANT[item.difficulty] ?? 'default'}>
                                          {DIFFICULTY_LABELS[item.difficulty] ?? item.difficulty}
                                        </Badge>
                                      )}
                                      <Badge variant={STATUS_VARIANT[item.status] ?? 'default'}>
                                        {STATUS_LABELS[item.status] ?? item.status}
                                      </Badge>
                                      {isDraft && (
                                        <Button
                                          size="sm"
                                          variant="outline"
                                          icon={<Icon.Upload className="w-3.5 h-3.5" />}
                                          onClick={() => setConfirmPublishIds([item.questionId])}
                                          disabled={bulkBusy}
                                        >
                                          Publish
                                        </Button>
                                      )}
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        onClick={() => navigate(managerQuestionEditPath(item.questionId))}
                                      >
                                        Detail
                                      </Button>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </article>
                );
              })
            )}
          </div>

          {groupsTotal > 0 && (
            <div className="card overflow-hidden">
              <Pagination
                page={groupPage}
                total={groupsTotal}
                perPage={PAGE_SIZE}
                onChange={setGroupPage}
                unit="groups"
              />
            </div>
          )}
        </>
      )}

      <ConfirmDialog
        open={confirmPublishIds != null && confirmPublishIds.length > 0}
        onClose={() => setConfirmPublishIds(null)}
        onConfirm={() => { if (confirmPublishIds) publishQuestions(confirmPublishIds); }}
        loading={bulkBusy}
        title={confirmPublishIds?.length === 1 ? 'Publish this question?' : `Publish ${confirmPublishIds?.length ?? 0} questions?`}
        description="This action can’t be undone."
        confirmLabel="Publish"
      />

      <ConfirmDialog
        open={confirmPublishGroup != null}
        onClose={() => setConfirmPublishGroup(null)}
        onConfirm={publishGroupNow}
        loading={publishingGroup}
        title={confirmPublishGroup ? `Publish all draft questions in “${groupLabel(confirmPublishGroup)}”?` : 'Publish group?'}
        description="Every draft question in this group will become Published. This action can’t be undone."
        confirmLabel="Publish Group"
      />

      <ConfirmDialog
        open={deleteGroupTarget != null}
        onClose={() => setDeleteGroupTarget(null)}
        onConfirm={deleteGroupNow}
        loading={deletingGroup}
        tone="danger"
        title={deleteGroupTarget ? `Delete group “${groupLabel(deleteGroupTarget)}”?` : 'Delete group?'}
        description="The group passage will be removed and its questions will become standalone. Groups used by a published exam cannot be deleted."
        confirmLabel="Delete Group"
      />

      <NewGroupModal
        open={editGroupTarget != null}
        onClose={() => setEditGroupTarget(null)}
        fixedKind={asGroupKind(editGroupTarget?.questionType) ?? undefined}
        initial={editGroupTarget ? {
          title: editGroupTarget.title ?? '',
          passage: editGroupTarget.passageText ?? '',
          kind: asGroupKind(editGroupTarget.questionType) ?? 'QUIZ',
        } : undefined}
        saveLabel="Save Group"
        onSave={async values => {
          if (!editGroupTarget) return;
          const updated = await questionGroupService.updateQuestionGroup(editGroupTarget.groupId, {
            title: values.title,
            passageText: values.passage,
          });
          setGroups(prev => prev.map(g => (g.groupId === updated.groupId ? updated : g)));
          toast.success(`Updated group “${groupLabel(updated)}”.`);
        }}
      />

      <ConfirmDialog
        open={confirmReplacePath != null}
        onClose={() => setConfirmReplacePath(null)}
        onConfirm={() => { if (confirmReplacePath) navigate(confirmReplacePath); setConfirmReplacePath(null); }}
        tone="danger"
        title="Replace your unsaved draft?"
        description="You have new questions that haven’t been saved yet. Opening this action will replace them. Save them first if you want to keep them."
        cancelLabel="Keep draft"
        confirmLabel="Discard & continue"
      />
    </div>
  );
}
