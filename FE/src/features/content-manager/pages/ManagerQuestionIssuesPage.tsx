import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import { Select } from '@/components/ui/Select';
import { Table, type TableColumn } from '@/components/ui/Table';
import { courseService, type CourseSummaryItem } from '@/services/course.service';
import { SearchInput } from '@/components/common/SearchInput';
import { ISSUE_STATUSES, ISSUE_TYPES, issueLabel, questionIssueService, refreshPendingIssueCount } from '@/services/questionIssue.service';
import { useAuth } from '@/auth/authContext';
import { getApiErrorMessage } from '@/utils/apiError';
import { IssueReviewModal, PriorityBadge, Status, unwrapList, useIssueReview } from '../components/issue-review';

const EMPTY_FILTERS = { status: 'ALL', issueType: '', courseId: '', search: '' };

export function ManagerQuestionIssuesPage() {
  const { user } = useAuth();
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState(EMPTY_FILTERS);
  const [page, setPage] = useState(0);
  const [sortKey, setSortKey] = useState('priority');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [list, setList] = useState<any>(null);
  const [courses, setCourses] = useState<CourseSummaryItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async (targetPage = page, selectedFilters = appliedFilters) => {
    setBusy(true);
    setError('');
    try {
      const query: Record<string, string | number> = { page: targetPage, size: 20, sort: `${sortKey},${sortDir}` };
      Object.entries(selectedFilters).forEach(([key, value]) => {
        if (value && value !== 'ALL') query[key] = value;
      });
      setList(await questionIssueService.managerList(query));
      refreshPendingIssueCount();
    } catch (e) {
      setError(getApiErrorMessage(e, 'Could not load the issue queue.'));
    } finally {
      setBusy(false);
    }
  }, [appliedFilters, page, sortDir, sortKey]);

  useEffect(() => { void load(page, appliedFilters); }, [load]);

  useEffect(() => {
    const changed = Object.keys(filters).some(key => filters[key as keyof typeof filters] !== appliedFilters[key as keyof typeof appliedFilters]);
    if (!changed) return;
    const timer = window.setTimeout(() => {
      setPage(0);
      setAppliedFilters({ ...filters });
    }, 400);
    return () => window.clearTimeout(timer);
  }, [filters, appliedFilters]);

  useEffect(() => {
    let cancelled = false;
    courseService.getCourses({ page: 0, size: 100, sort: 'title,asc' }).then(result => {
      if (!cancelled) setCourses(result.content);
    }).catch(() => {
      if (!cancelled) setCourses([]);
    });
    return () => { cancelled = true; };
  }, []);

  // The ticket review modal owns its own state; the queue reloads whenever a ticket changes.
  const review = useIssueReview({ userId: user?.userId, onChanged: () => load(page, appliedFilters) });

  const rows = unwrapList(list);
  const courseOptions = useMemo(() => [
    { label: 'All courses', value: '' },
    ...courses.map(course => ({ label: course.title, value: String(course.courseId) })),
  ], [courses]);
  const courseNames = useMemo(() => new Map(courses.map(course => [String(course.courseId), course.title])), [courses]);
  const columns: TableColumn[] = [
    {
      key: 'question', label: 'Question and issue', width: '40%',
      render: value => {
        const row = value as any;
        return <div className="min-w-0">
          <p className="line-clamp-2 whitespace-normal text-sm font-medium text-content" title={row.questionContent || row.question?.content || 'Question content unavailable'}>{row.questionContent || row.question?.content || 'Question content unavailable'}</p>
          <p className="mt-1 truncate text-xs text-content-subtle">Question #{row.questionId}</p>
          <p className="mt-1 truncate text-xs text-content-secondary">{issueLabel(row.issueType)} · Ticket #{row.issueId}</p>
        </div>;
      },
    },
    { key: 'course', label: 'Course', render: value => {
      const row = value as any;
      return <span className="block truncate" title={row.courseName || row.courseTitle || row.course?.title || row.course?.name || courseNames.get(String(row.courseId)) || '—'}>{row.courseName || row.courseTitle || row.course?.title || row.course?.name || courseNames.get(String(row.courseId)) || '—'}</span>;
    } },
    { key: 'reportCount', label: 'Reports', className: 'whitespace-nowrap', render: value => (value as any).reportCount ?? 0 },
    { key: 'priority', label: 'Priority', sortable: true, className: 'whitespace-nowrap', render: value => <PriorityBadge priority={(value as any).priority} score={(value as any).priorityScore ?? 0} /> },
    { key: 'updatedAt', label: 'Updated', sortable: true, className: 'whitespace-nowrap', render: value => {
      const row = value as any;
      const updated = row.updatedAt || row.createdAt;
      return updated ? <span title={new Date(updated).toLocaleString()}>{new Date(updated).toLocaleDateString()}</span> : '—';
    } },
    { key: 'status', label: 'Status', render: value => <Status value={(value as any).status} /> },
  ];

  const changeSort = (key: string) => {
    setSortDir(current => sortKey === key && current === 'desc' ? 'asc' : 'desc');
    setSortKey(key);
    setPage(0);
  };

  return <main className="mx-auto max-w-screen-2xl space-y-6 p-6 lg:p-8">
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold text-content">Question issue queue</h1>
        <p className="mt-1 text-sm text-content-secondary">Review student reports, correct affected questions, and monitor regrade work.</p>
      </div>
    </header>

    {error && <Alert type="error" message={error} />}

    <section className="card space-y-3 px-4 py-4">
        <SearchInput
          className="w-full"
          aria-label="Search questions and reports"
          placeholder="Search questions and reports…"
          value={filters.search}
          onChange={event => setFilters(current => ({ ...current, search: event.target.value }))}
        />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Select label="Status" value={filters.status} onChange={value => setFilters(current => ({ ...current, status: value }))} options={[
          { label: 'Pending', value: 'PENDING' },
          ...ISSUE_STATUSES.filter(value => value !== 'PENDING').map(value => ({ label: issueLabel(value), value })),
          { label: 'All statuses', value: 'ALL' },
        ]} />
        <Select label="Issue type" value={filters.issueType} onChange={value => setFilters(current => ({ ...current, issueType: value }))} options={[
          { label: 'All issue types', value: '' },
          ...ISSUE_TYPES.map(value => ({ label: issueLabel(value), value })),
        ]} />
        <SearchableSelect label="Course" options={courseOptions} value={filters.courseId} onChange={value => setFilters(current => ({ ...current, courseId: value }))} placeholder="All courses" searchPlaceholder="Search courses…" />
        </div>
        <div className="ml-auto flex items-center gap-2">
          {Object.keys(EMPTY_FILTERS).some(key => filters[key as keyof typeof filters] !== EMPTY_FILTERS[key as keyof typeof EMPTY_FILTERS]) && <button type="button" disabled={busy} onClick={() => {
            setFilters({ ...EMPTY_FILTERS });
            setAppliedFilters({ ...EMPTY_FILTERS });
            setPage(0);
          }} className="inline-flex items-center gap-1 whitespace-nowrap text-sm font-medium text-brand-ink hover:underline disabled:opacity-50"><span aria-hidden="true">×</span> Clear filters</button>}
          <Badge variant="default" className="whitespace-nowrap font-semibold text-xs">{list?.totalElements ?? 0} tickets</Badge>
        </div>
    </section>

    <div className={`card overflow-hidden transition-opacity ${busy && list ? 'opacity-60' : ''}`} aria-busy={busy}>
      <Table
        columns={columns}
        data={rows.map((row: any) => ({ ...row, id: row.issueId }))}
        unit="tickets"
        onSort={changeSort}
        sortKey={sortKey}
        sortDir={sortDir}
        serverPagination={{ page: page + 1, total: list?.totalElements ?? 0, onChange: value => setPage(value - 1) }}
        onRowClick={row => void review.open(row as any)}
        emptyState={busy ? 'Loading tickets…' : 'No tickets found. Try changing the status or clearing some filters.'}
      />
    </div>

    <IssueReviewModal review={review} courseNames={courseNames} />
  </main>;
}
