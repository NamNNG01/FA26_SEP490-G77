import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import { Select } from '@/components/ui/Select';
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
  const [list, setList] = useState<any>(null);
  const [courses, setCourses] = useState<CourseSummaryItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async (targetPage = page, selectedFilters = appliedFilters) => {
    setBusy(true);
    setError('');
    try {
      const query: Record<string, string | number> = { page: targetPage, size: 20, sort: 'priority,desc' };
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
  }, [appliedFilters, page]);

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
  const pages = list?.totalPages ?? 1;
  const courseOptions = useMemo(() => [
    { label: 'All courses', value: '' },
    ...courses.map(course => ({ label: course.title, value: String(course.courseId) })),
  ], [courses]);
  const courseNames = useMemo(() => new Map(courses.map(course => [String(course.courseId), course.title])), [courses]);

  return <main className="mx-auto max-w-screen-2xl space-y-6 p-6 lg:p-8">
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold text-content">Question issue queue</h1>
        <p className="mt-1 text-sm text-content-secondary">Review student reports, correct affected questions, and monitor regrade work.</p>
      </div>
    </header>

    {error && <Alert type="error" message={error} />}

    <section className="overflow-hidden rounded-xl border border-line bg-surface shadow-sm">
      <div className="flex flex-wrap items-center gap-3 border-b border-line-soft px-4 py-3">
        <SearchInput
          className="w-full sm:w-64 lg:flex-1"
          aria-label="Search questions and reports"
          placeholder="Search questions and reports…"
          value={filters.search}
          onChange={event => setFilters(current => ({ ...current, search: event.target.value }))}
        />
        <Select aria-label="Filter by status" className="w-full sm:w-40" value={filters.status} onChange={value => setFilters(current => ({ ...current, status: value }))} options={[
          { label: 'Pending', value: 'PENDING' },
          ...ISSUE_STATUSES.filter(value => value !== 'PENDING').map(value => ({ label: issueLabel(value), value })),
          { label: 'All statuses', value: 'ALL' },
        ]} />
        <Select aria-label="Filter by issue type" className="w-full sm:w-48" value={filters.issueType} onChange={value => setFilters(current => ({ ...current, issueType: value }))} options={[
          { label: 'All issue types', value: '' },
          ...ISSUE_TYPES.map(value => ({ label: issueLabel(value), value })),
        ]} />
        <SearchableSelect className="w-full sm:w-56" showLabel={false} aria-label="Filter by course" options={courseOptions} value={filters.courseId} onChange={value => setFilters(current => ({ ...current, courseId: value }))} placeholder="All courses" searchPlaceholder="Search courses…" />
        <div className="ml-auto flex items-center gap-2">
          <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => {
            setFilters({ ...EMPTY_FILTERS });
            setAppliedFilters({ ...EMPTY_FILTERS });
            setPage(0);
          }}>Clear</Button>
          <Badge variant="default" className="whitespace-nowrap font-semibold text-xs">{list?.totalElements ?? 0} tickets</Badge>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[950px] text-left text-sm">
          <thead className="bg-surface-muted text-content-secondary"><tr>
            <th className="px-5 py-3 font-medium">Question and issue</th>
            <th className="px-5 py-3 font-medium">Course</th>
            <th className="px-5 py-3 font-medium">Reports</th>
            <th className="px-5 py-3 font-medium">Priority</th>
            <th className="px-5 py-3 font-medium">Updated</th>
            <th className="px-5 py-3 font-medium">Status</th>
          </tr></thead>
          <tbody className="divide-y divide-line">
            {rows.map((row: any) => <tr key={row.issueId} tabIndex={0} onClick={() => void review.open(row)} onKeyDown={event => {
              if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); void review.open(row); }
            }} className="cursor-pointer hover:bg-surface-hover focus:bg-surface-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-600">
              <td className="max-w-xl px-5 py-4">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-content" title={row.questionContent || row.question?.content || 'Question content unavailable'}>{row.questionContent || row.question?.content || 'Question content unavailable'}</p>
                  <p className="mt-1 truncate text-xs text-content-subtle" title={`Question #${row.questionId}`}>Question #{row.questionId}</p>
                  <p className="mt-1 truncate text-xs text-content-secondary" title={`${issueLabel(row.issueType)} · Ticket #${row.issueId}`}>{issueLabel(row.issueType)} · Ticket #{row.issueId}</p>
                </div>
              </td>
              <td className="max-w-xs truncate px-5 py-4 text-content-secondary">{row.courseName || row.courseTitle || row.course?.title || row.course?.name || courseNames.get(String(row.courseId)) || '—'}</td>
              <td className="whitespace-nowrap px-5 py-4 text-content-secondary">{row.reportCount ?? 0}</td>
              <td className="whitespace-nowrap px-5 py-4"><PriorityBadge priority={row.priority} score={row.priorityScore ?? 0} /></td>
              <td className="whitespace-nowrap px-5 py-4 text-content-secondary">{row.updatedAt || row.createdAt ? new Date(row.updatedAt || row.createdAt).toLocaleDateString() : '—'}</td>
              <td className="px-5 py-4"><Status value={row.status} /></td>
            </tr>)}
            {!rows.length && <tr><td colSpan={6} className="p-12 text-center"><p className="font-medium text-content">{busy ? 'Loading tickets…' : 'No tickets found'}</p><p className="mt-1 text-sm text-content-secondary">{busy ? 'The issue queue is being refreshed.' : 'Try another status or clear some filters.'}</p></td></tr>}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-4 text-sm">
        <span className="text-content-secondary">Showing {rows.length ? page * (list?.size ?? 20) + 1 : 0}–{page * (list?.size ?? 20) + rows.length} of {list?.totalElements ?? 0}</span>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" disabled={page <= 0 || busy} onClick={() => setPage(current => current - 1)}>Previous</Button>
          <span className="min-w-24 text-center text-content-secondary">Page {page + 1} of {Math.max(1, pages)}</span>
          <Button size="sm" variant="outline" disabled={page + 1 >= pages || busy} onClick={() => setPage(current => current + 1)}>Next</Button>
        </div>
      </div>
    </section>

    <IssueReviewModal review={review} courseNames={courseNames} />
  </main>;
}
