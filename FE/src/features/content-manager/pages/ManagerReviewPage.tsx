import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { apiClient } from '@/services/axios';
import { courseService, type CourseModuleResponse, type CourseSummaryItem } from '@/services/course.service';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import { Select } from '@/components/ui/Select';
import { Icon } from '@/assets/icons';

type Kind = 'contributions' | 'decks';
type Row = Record<string, any>;
const unwrap = (response: any) => {
  if (!response?.success) throw Object.assign(new Error(response?.message || 'Request failed'), { data: response?.data });
  return response.data;
};
const idOf = (row: Row, kind: Kind) => kind === 'contributions' ? row.contributionId : row.deckId;
const statusOf = (row: Row, kind: Kind) => kind === 'contributions' ? row.status : row.reviewStatus;
const QUESTION_TYPES = ['SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'TRUE_FALSE', 'MATCHING', 'FILL_BLANK', 'ORDERING', 'ESSAY', 'CODE', 'DIAGRAM'];
const questionTypeLabel = (value: string) => ({
  SINGLE_CHOICE: 'Single choice', MULTIPLE_CHOICE: 'Multiple choice', TRUE_FALSE: 'True or false',
  MATCHING: 'Matching', FILL_BLANK: 'Fill in the blank', ORDERING: 'Ordering', ESSAY: 'Essay', CODE: 'Code', DIAGRAM: 'Diagram',
} as Record<string, string>)[value] || value;
const statusLabel = (value: string) => ({ PENDING: 'Pending', ACCEPTED: 'Approved', APPROVED: 'Approved', REJECTED: 'Rejected', ALL: 'All statuses' } as Record<string, string>)[value] || value;
const difficultyLabel = (value: string) => value ? value[0] + value.slice(1).toLowerCase() : '—';
const dateTimeLocal = (value: string | null, subtractMilliseconds = 0) => {
  if (!value) return '';
  const date = new Date(new Date(value).getTime() - subtractMilliseconds);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};

export function ManagerReviewPage() {
  const [params, setParams] = useSearchParams();
  const [kind, setKind] = useState<Kind>(params.get('kind') === 'decks' ? 'decks' : 'contributions');
  const [rows, setRows] = useState<Row[]>([]);
  const [detail, setDetail] = useState<Row | null>(null);
  const [pageData, setPageData] = useState<any>({ page: 0, totalPages: 0, totalElements: 0 });
  const [status, setStatus] = useState(() => {
    const value = params.get('status') || 'PENDING';
    if (value === 'APPROVED' && params.get('kind') !== 'decks') return 'ACCEPTED';
    if (value === 'ACCEPTED' && params.get('kind') === 'decks') return 'APPROVED';
    return value;
  });
  const [keyword, setKeyword] = useState(params.get('keyword') || '');
  const [courseId, setCourseId] = useState(params.get('courseId') || '');
  const [moduleId, setModuleId] = useState(params.get('moduleId') || '');
  const [contributorId, setContributorId] = useState(params.get('contributorId') || '');
  const [questionType, setQuestionType] = useState(params.get('questionType') || '');
  const [difficulty, setDifficulty] = useState(params.get('difficulty') || '');
  const [submittedFrom, setSubmittedFrom] = useState(dateTimeLocal(params.get('submittedFrom')));
  const [submittedTo, setSubmittedTo] = useState(dateTimeLocal(params.get('submittedTo'), 60_000));
  const [courses, setCourses] = useState<CourseSummaryItem[]>([]);
  const [modules, setModules] = useState<CourseModuleResponse[]>([]);
  const [students, setStudents] = useState<{ userId: number; fullName: string }[]>([]);
  const [contributorSearch, setContributorSearch] = useState('');
  const [studentsLoading, setStudentsLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [openingId, setOpeningId] = useState<number | string | null>(null);
  const [reason, setReason] = useState('');
  const [rejecting, setRejecting] = useState(false);
  const [error, setError] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);

  const load = useCallback(async (nextPage = Number(params.get('page') || 0)) => {
    setBusy(true);
    setError('');
    try {
      const query = new URLSearchParams({ page: String(nextPage), size: '20', status });
      if (keyword.trim()) query.set('keyword', keyword.trim());
      if (courseId) query.set('courseId', courseId);
      if (moduleId) query.set('moduleId', moduleId);
      if (contributorId) query.set('contributorId', contributorId);
      if (kind === 'contributions' && questionType) query.set('questionType', questionType);
      if (kind === 'contributions' && difficulty) query.set('difficulty', difficulty);
      if (submittedFrom) query.set('submittedFrom', new Date(submittedFrom).toISOString());
      if (submittedTo) query.set('submittedTo', new Date(new Date(submittedTo).getTime() + 60_000).toISOString());
      const data = unwrap((await apiClient.get(`/manager/${kind}?${query}`)).data);
      setRows(data.content || []);
      setPageData(data);
      setDetail(null);
    } catch (e: any) {
      setError(e.message || 'Could not load review queue');
    } finally {
      setBusy(false);
    }
  }, [kind, status, keyword, courseId, moduleId, contributorId, questionType, difficulty, submittedFrom, submittedTo, params]);

  useEffect(() => {
    let cancelled = false;
    courseService.getCourses({ size: 100, sort: 'title,asc' }).then(result => {
      if (!cancelled) setCourses(result.content);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!courseId) {
      setModules([]);
      setModuleId('');
      return;
    }
    setModules([]);
    courseService.getCourseModules(courseId).then(result => {
      if (!cancelled) setModules(result);
    }).catch(() => {
      if (!cancelled) setModules([]);
    });
    return () => { cancelled = true; };
  }, [courseId]);

  useEffect(() => {
    if (courses.length === 0) return;
    let cancelled = false;
    const timeout = window.setTimeout(async () => {
      setStudentsLoading(true);
      try {
        const relevantCourses = courseId ? courses.filter(course => String(course.courseId) === courseId) : courses;
        const pages = await Promise.all(relevantCourses.map(course => courseService.getCourseStudents(course.courseId, {
          search: contributorSearch.trim() || undefined,
          page: 0,
          size: 100,
        })));
        if (!cancelled) {
          const unique = new Map<number, { userId: number; fullName: string }>();
          pages.flatMap(result => result.content).forEach(student => unique.set(student.userId, { userId: student.userId, fullName: student.fullName }));
          setStudents([...unique.values()].sort((a, b) => a.fullName.localeCompare(b.fullName)));
        }
      } catch {
        if (!cancelled) setStudents([]);
      } finally {
        if (!cancelled) setStudentsLoading(false);
      }
    }, contributorSearch ? 250 : 0);
    return () => { cancelled = true; window.clearTimeout(timeout); };
  }, [filtersOpen, courses, courseId, contributorSearch]);

  const syncUrl = (pageNumber = 0) => {
    const next: Record<string, string> = { kind, status, page: String(pageNumber) };
    if (keyword.trim()) next.keyword = keyword.trim();
    if (courseId) next.courseId = courseId;
    if (moduleId) next.moduleId = moduleId;
    if (contributorId) next.contributorId = contributorId;
    if (kind === 'contributions' && questionType) next.questionType = questionType;
    if (kind === 'contributions' && difficulty) next.difficulty = difficulty;
    if (submittedFrom) next.submittedFrom = new Date(submittedFrom).toISOString();
    if (submittedTo) next.submittedTo = new Date(new Date(submittedTo).getTime() + 60_000).toISOString();
    setParams(next, { replace: true });
  };

  useEffect(() => {
    syncUrl(0);
    load(0);
  }, [kind, status]);

  const open = async (row: Row) => {
    setDetailLoading(true);
    setOpeningId(idOf(row, kind));
    setError('');
    try {
      const data = unwrap((await apiClient.get(`/manager/${kind}/${idOf(row, kind)}`)).data);
      setDetail(data);
      setRejecting(false);
      setReason('');
    } catch (e: any) {
      setError(e.message || 'Could not load item');
    } finally {
      setDetailLoading(false);
      setOpeningId(null);
    }
  };

  const review = async (decision: 'approve' | 'reject') => {
    if (!detail) return;
    if (decision === 'reject' && reason.trim().length < 5) {
      setError('Please enter a reason of at least 5 characters.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const id = idOf(detail, kind);
      const payload = decision === 'approve' ? { version: detail.version, note: '' } : { version: detail.version, reason: reason.trim() };
      unwrap((await apiClient.post(`/manager/${kind}/${id}/${decision}`, payload)).data);
      setRejecting(false);
      setReason('');
      await load(Number(params.get('page') || 0));
    } catch (e: any) {
      setError(e.message || 'Review action failed. Reload the item and try again.');
    } finally {
      setBusy(false);
    }
  };

  const clearFilters = async () => {
    setKeyword('');
    setCourseId('');
    setModuleId('');
    setContributorId('');
    setQuestionType('');
    setDifficulty('');
    setSubmittedFrom('');
    setSubmittedTo('');
    setParams({ kind, status, page: '0' }, { replace: true });
    setBusy(true);
    setError('');
    try {
      const data = unwrap((await apiClient.get(`/manager/${kind}?page=0&size=20&status=${status}`)).data);
      setRows(data.content || []);
      setPageData(data);
      setDetail(null);
    } catch (e: any) {
      setError(e.message || 'Could not load review queue');
    } finally {
      setBusy(false);
    }
  };

  const page = Number(pageData.page || 0);
  const detailStatus = detail && statusOf(detail, kind);
  const extraFilterCount = [moduleId, contributorId, submittedFrom, submittedTo, kind === 'contributions' ? questionType : '', kind === 'contributions' ? difficulty : ''].filter(Boolean).length;
  const courseOptions = [{ label: 'All courses', value: '' }, ...courses.map(course => ({ label: course.title, value: String(course.courseId) }))];
  const moduleOptions = [{ label: 'All modules', value: '' }, ...modules.map(module => ({ label: module.title, value: String(module.moduleId) }))];
  const contributorOptions = [
    { label: 'Any contributor', value: '' },
    ...students.map(student => ({ label: `${student.fullName} (#${student.userId})`, value: String(student.userId) })),
  ];
  if (contributorId && !contributorOptions.some(option => option.value === contributorId)) contributorOptions.push({ label: `Contributor #${contributorId}`, value: contributorId });
  const studentNames = new Map(students.map(student => [String(student.userId), student.fullName]));

  return <main className="mx-auto max-w-screen-2xl space-y-6 p-6 lg:p-8">
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div><h1 className="text-2xl font-bold text-content">Content review</h1><p className="mt-1 text-sm text-content-subtle">Review student questions and flashcard decks submitted for publication.</p></div>
      <div className="rounded-lg bg-surface-muted px-3 py-2 text-sm text-content-secondary">{pageData.totalElements || 0} submissions</div>
    </header>

    <div className="flex gap-2 border-b border-line" role="tablist" aria-label="Review type">
      {(['contributions', 'decks'] as Kind[]).map(tab => <button key={tab} type="button" role="tab" aria-selected={kind === tab} onClick={() => {
        setKind(tab);
        if (tab === 'decks') {
          setQuestionType('');
          setDifficulty('');
        }
        if (status === 'APPROVED' || status === 'ACCEPTED') setStatus(tab === 'contributions' ? 'ACCEPTED' : 'APPROVED');
      }} className={`border-b-2 px-4 py-3 text-sm font-semibold transition-colors ${kind === tab ? 'border-brand-600 text-brand-700' : 'border-transparent text-content-secondary hover:text-content'}`}>
        {tab === 'contributions' ? 'Question contributions' : 'Flashcard decks'}
      </button>)}
    </div>

    {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>}

    <section className="overflow-visible rounded-xl border border-line bg-surface shadow-sm">
      <form onSubmit={e => { e.preventDefault(); syncUrl(0); load(0); }} className="space-y-4 border-b border-line p-4 sm:p-5">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(150px,0.65fr)_minmax(220px,1.5fr)_minmax(220px,1.2fr)] lg:items-end">
          <Select label="Status" triggerClassName="w-full h-10 pl-3 pr-10 rounded-lg text-sm" value={status} onChange={setStatus} options={[
            { label: 'Pending', value: 'PENDING' },
            { label: 'Approved', value: kind === 'contributions' ? 'ACCEPTED' : 'APPROVED' },
            { label: 'Rejected', value: 'REJECTED' },
            { label: 'All statuses', value: 'ALL' },
          ]} />
          <label className="grid gap-1.5 text-sm font-medium text-content-secondary">Search submissions
            <input className="h-10 rounded-lg border border-line bg-surface px-3 text-content placeholder:text-content-subtle" value={keyword} onChange={e => setKeyword(e.target.value)} placeholder="Search title or content" />
          </label>
          <SearchableSelect label="Course" options={courseOptions} value={courseId} onChange={value => { setCourseId(value); setModuleId(''); }} placeholder="All courses" searchPlaceholder="Search courses…" />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <button type="button" aria-expanded={filtersOpen} onClick={() => setFiltersOpen(value => !value)} className="inline-flex items-center gap-2 rounded-lg px-2 py-2 text-sm font-medium text-content-secondary hover:bg-surface-hover hover:text-content">
            <span>{filtersOpen ? 'Hide filters' : 'More filters'}</span>
            {extraFilterCount > 0 && <span className="rounded-full bg-brand-50 px-2 py-0.5 text-xs font-semibold text-brand-700">{extraFilterCount} active</span>}
            <Icon.ChevronDown aria-hidden="true" className={`h-4 w-4 shrink-0 transition-transform ${filtersOpen ? 'rotate-180' : ''}`} />
          </button>
          <div className="flex gap-2">
            <Button type="button" variant="outline" disabled={busy} onClick={() => void clearFilters()}>Clear filters</Button>
            <Button type="submit" loading={busy}>Apply filters</Button>
          </div>
        </div>

        {filtersOpen && <div className="grid gap-3 border-t border-line-soft pt-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          <SearchableSelect label="Module" options={moduleOptions} value={moduleId} onChange={setModuleId} disabled={!courseId} placeholder={courseId ? 'All modules' : 'Choose a course first'} searchPlaceholder="Search modules…" />
          <SearchableSelect label="Contributor" options={contributorOptions} value={contributorId} onChange={setContributorId} onSearchChange={setContributorSearch} placeholder="Any contributor" searchPlaceholder="Search students by name…" emptyText={studentsLoading ? 'Searching students…' : 'No students found'} />
          {kind === 'contributions' && <>
            <Select label="Question type" triggerClassName="w-full h-10 pl-3 pr-10 rounded-lg text-sm" value={questionType} onChange={setQuestionType} options={[{ label: 'All question types', value: '' }, ...QUESTION_TYPES.map(type => ({ label: questionTypeLabel(type), value: type }))]} />
            <Select label="Difficulty" triggerClassName="w-full h-10 pl-3 pr-10 rounded-lg text-sm" value={difficulty} onChange={setDifficulty} options={[{ label: 'All difficulties', value: '' }, { label: 'Easy', value: 'EASY' }, { label: 'Medium', value: 'MEDIUM' }, { label: 'Hard', value: 'HARD' }]} />
          </>}
          <label className="grid gap-1.5 text-sm font-medium text-content-secondary">Submitted after
            <input type="datetime-local" className="h-10 rounded-lg border border-line bg-surface px-3 text-content" value={submittedFrom} onChange={e => setSubmittedFrom(e.target.value)} />
          </label>
          <label className="grid gap-1.5 text-sm font-medium text-content-secondary">Submitted before
            <input type="datetime-local" className="h-10 rounded-lg border border-line bg-surface px-3 text-content" value={submittedTo} onChange={e => setSubmittedTo(e.target.value)} />
          </label>
        </div>}
      </form>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="bg-surface-muted text-content-secondary"><tr>
            <th className="px-5 py-3 font-medium">Submission</th><th className="px-5 py-3 font-medium">Contributor</th><th className="px-5 py-3 font-medium">Course</th><th className="px-5 py-3 font-medium">Submitted</th><th className="px-5 py-3 font-medium">Status</th><th className="px-5 py-3"><span className="sr-only">Open</span></th>
          </tr></thead>
          <tbody className="divide-y divide-line">
            {rows.map(row => <tr key={idOf(row, kind)} onDoubleClick={() => void open(row)} className="group hover:bg-surface-hover">
              <td className="max-w-sm px-5 py-4"><div className="truncate font-medium text-content">{row.title || row.content || `Submission #${idOf(row, kind)}`}</div><div className="mt-1 truncate text-xs text-content-secondary">{kind === 'decks' ? `${row.cardCount ?? 0} cards${row.module?.title ? ` · ${row.module.title}` : ''}` : row.questionType ? questionTypeLabel(row.questionType) : `Submission #${idOf(row, kind)}`}</div></td>
              <td className="whitespace-nowrap px-5 py-4 text-content-secondary">{row.owner?.fullName || row.contributor?.fullName || studentNames.get(String(row.contributor?.id ?? row.contributorId)) || row.contributorName || '—'}</td>
              <td className="max-w-xs truncate px-5 py-4 text-content-secondary">{row.course?.title || '—'}</td>
              <td className="whitespace-nowrap px-5 py-4 text-content-secondary">{row.submittedAt ? new Date(row.submittedAt).toLocaleString() : '—'}</td>
              <td className="px-5 py-4"><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${statusOf(row, kind) === 'PENDING' ? 'bg-amber-50 text-amber-800' : statusOf(row, kind) === 'REJECTED' ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>{statusLabel(statusOf(row, kind) || '')}</span></td>
              <td className="px-5 py-4 text-right"><Button size="sm" variant="outline" loading={detailLoading && openingId === idOf(row, kind)} onClick={() => void open(row)}>Review</Button></td>
            </tr>)}
            {!rows.length && <tr><td colSpan={6} className="p-12 text-center"><p className="font-medium text-content">{busy ? 'Loading submissions…' : 'No submissions found'}</p><p className="mt-1 text-sm text-content-secondary">{busy ? 'The review queue is being refreshed.' : 'Try changing the status or clearing some filters.'}</p></td></tr>}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-4 text-sm">
        <span className="text-content-secondary">Showing {rows.length ? page * pageData.size + 1 : 0}–{page * pageData.size + rows.length} of {pageData.totalElements || 0}</span>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" disabled={page <= 0 || busy} onClick={() => { syncUrl(page - 1); load(page - 1); }}>Previous</Button>
          <span className="min-w-20 text-center text-content-secondary">Page {page + 1} of {Math.max(1, pageData.totalPages || 1)}</span>
          <Button size="sm" variant="outline" disabled={page + 1 >= (pageData.totalPages || 1) || busy} onClick={() => { syncUrl(page + 1); load(page + 1); }}>Next</Button>
        </div>
      </div>
    </section>

    <Modal open={!!detail || detailLoading} onClose={() => { setDetail(null); setRejecting(false); setReason(''); setError(''); }} title={detail ? (detail.title || `Submission #${idOf(detail, kind)}`) : 'Loading submission…'} size="2xl" footer={detail && <>
      {detail.canReview && detailStatus === 'PENDING' && rejecting ? <>
        <Button variant="outline" onClick={() => { setRejecting(false); setReason(''); setError(''); }} disabled={busy}>Cancel rejection</Button>
        <Button variant="danger" onClick={() => void review('reject')} loading={busy} disabled={reason.trim().length < 5}>Confirm rejection</Button>
      </> : detail.canReview && detailStatus === 'PENDING' ? <>
        <Button variant="outline" onClick={() => setDetail(null)} disabled={busy}>Close</Button>
        <Button variant="danger" onClick={() => { setRejecting(true); setError(''); }} disabled={busy}>Reject</Button>
        <Button onClick={() => void review('approve')} loading={busy} disabled={!!detail.duplicateCheck?.isDuplicate}>Approve</Button>
      </> : <Button variant="outline" onClick={() => setDetail(null)}>Close</Button>}
    </>}>
      {!detail ? <div className="py-12 text-center text-sm text-content-secondary">Loading submission details…</div> : <div className="space-y-5">
        {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>}
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${detailStatus === 'PENDING' ? 'bg-amber-50 text-amber-800' : detailStatus === 'REJECTED' ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>{statusLabel(detailStatus || '')}</span>
          <span className="text-xs text-content-secondary">{kind === 'decks' ? 'Flashcard deck' : 'Question contribution'}</span>
          <span className="ml-auto text-xs text-content-secondary">Version {detail.version ?? 0}</span>
        </div>
        <div className="grid gap-3 rounded-lg bg-surface-muted p-4 text-sm sm:grid-cols-2">
          <p><span className="text-content-secondary">Contributor</span><br /><span className="font-medium text-content">{detail.owner?.fullName || detail.contributor?.fullName || detail.contributorName || '—'}</span></p>
          <p><span className="text-content-secondary">Course and module</span><br /><span className="font-medium text-content">{detail.course?.title || '—'}{detail.module?.title ? ` · ${detail.module.title}` : ''}</span></p>
          <p><span className="text-content-secondary">Submitted</span><br /><span className="font-medium text-content">{detail.submittedAt || detail.createdAt ? new Date(detail.submittedAt || detail.createdAt).toLocaleString() : '—'}</span></p>
          {kind === 'contributions' && <p><span className="text-content-secondary">Type and difficulty</span><br /><span className="font-medium text-content">{questionTypeLabel(detail.questionType || detail.type || '')} · {difficultyLabel(detail.difficulty || 'MEDIUM')}</span></p>}
        </div>
        {detail.description && <section><h3 className="mb-2 text-sm font-semibold text-content">Description</h3><p className="whitespace-pre-wrap text-sm text-content-secondary">{detail.description}</p></section>}
        {kind === 'decks' ? <section className="space-y-3"><div className="flex items-center justify-between"><h3 className="text-sm font-semibold text-content">Cards</h3><span className="text-xs text-content-secondary">{detail.cardCount ?? detail.cards?.totalElements ?? 0} total</span></div>{(detail.cards?.content || []).map((card: Row) => <div key={card.cardId} className="rounded-lg border border-line p-4"><p className="font-medium text-content">{card.frontText}</p><p className="mt-2 whitespace-pre-wrap text-sm text-content-secondary">{card.backText}</p>{card.codeBody && <pre className="mt-2 overflow-auto rounded bg-surface-muted p-3 text-sm"><code>{card.codeBody}</code></pre>}</div>)}</section> : <>
          <section><h3 className="mb-2 text-sm font-semibold text-content">Question</h3><p className="whitespace-pre-wrap rounded-lg border border-line p-4 text-sm text-content">{detail.question?.content || detail.content || detail.questionText || '—'}</p></section>
          {detail.explanation && <section><h3 className="mb-2 text-sm font-semibold text-content">Explanation</h3><p className="whitespace-pre-wrap text-sm text-content-secondary">{detail.explanation}</p></section>}
          {detail.duplicateCheck?.isDuplicate && <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Similar content detected. Existing question #{detail.duplicateCheck.existingQuestionId}; approval is disabled.</p>}
        </>}
        {!!detail.history?.length && <section><h3 className="mb-2 text-sm font-semibold text-content">Review history</h3><div className="space-y-2">{detail.history.map((entry: Row, index: number) => <div key={index} className="rounded-lg border border-line px-3 py-2 text-sm"><div className="flex flex-wrap justify-between gap-2"><span className="font-medium text-content">{statusLabel(entry.decision || '')}</span><span className="text-xs text-content-secondary">{entry.createdAt ? new Date(entry.createdAt).toLocaleString() : ''}</span></div>{(entry.note || entry.reason) && <p className="mt-1 whitespace-pre-wrap text-content-secondary">{entry.note || entry.reason}</p>}</div>)}</div></section>}
        {!detail.canReview && <p className="rounded-lg bg-surface-muted p-3 text-sm text-content-secondary">This item cannot be reviewed by your account.</p>}
        {rejecting && <section className="rounded-lg border border-red-200 bg-red-50 p-4"><label className="grid gap-2 text-sm font-medium text-red-900">Reason for rejection<textarea autoFocus maxLength={1000} value={reason} onChange={e => setReason(e.target.value)} onKeyDown={e => e.key === 'Enter' && (e.ctrlKey || e.metaKey) && reason.trim().length >= 5 && void review('reject')} rows={4} className="rounded-lg border border-line bg-white p-3 text-content" placeholder="Explain why this submission is being rejected" /></label><div className="mt-2 flex justify-between text-xs text-content-secondary"><span>At least 5 characters</span><span>{reason.length}/1000</span></div></section>}
      </div>}
    </Modal>
  </main>;
}
