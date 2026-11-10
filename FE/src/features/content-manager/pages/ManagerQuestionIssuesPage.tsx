import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import { Select } from '@/components/ui/Select';
import { QuestionForm } from '@/features/question/components/QuestionForm';
import { fromDetail, isDraftValid, toCreateRequest, type QuestionDraft } from '@/features/question/model';
import type { QuestionDetail } from '@/services/question.service';
import { courseService, type CourseSummaryItem } from '@/services/course.service';
import { ISSUE_STATUSES, ISSUE_TYPES, issueLabel, questionIssueService } from '@/services/questionIssue.service';
import { useAuth } from '@/auth/authContext';
import { getApiErrorMessage } from '@/utils/apiError';

const RESOLUTION_TYPES = ['CONTENT_CORRECTED', 'EXPLANATION_CORRECTED', 'AI_EXPLANATION_CORRECTED', 'ANSWER_CORRECTED', 'RUBRIC_CORRECTED', 'QUESTION_VOIDED', 'OTHER_CORRECTION'];
const EMPTY_FILTERS = { status: 'PENDING', issueType: '', courseId: '', search: '' };

function Status({ value = '' }: { value?: string }) {
  const color = value === 'RESOLVED' ? 'bg-emerald-50 text-emerald-700' : value === 'REJECTED' ? 'bg-red-50 text-red-700' : value === 'IN_PROGRESS' ? 'bg-blue-50 text-blue-700' : value === 'DUPLICATE' ? 'bg-slate-100 text-slate-600' : 'bg-amber-50 text-amber-800';
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${color}`}>{issueLabel(value)}</span>;
}

function unwrapList(value: any) { return Array.isArray(value) ? value : value?.content ?? value?.items ?? []; }

function toQuestionDetail(detail: any): QuestionDetail {
  const question = detail.question;
  return {
    questionId: question.questionId,
    courseId: detail.courseId ?? null,
    moduleId: null,
    groupId: null,
    questionType: question.questionType,
    difficulty: question.difficulty ?? 'MEDIUM',
    content: question.content ?? '',
    questionMetadata: question.questionMetadata ?? null,
    answerKey: question.answerKey ?? null,
    defaultPoints: null,
    source: 'ISSUE_REVIEW',
    creatorRole: '',
    createdBy: null,
    scoringVersion: question.scoringVersion ?? null,
    lockVersion: question.lockVersion ?? null,
    aiExplanation: question.explanation ?? null,
    status: question.status ?? 'ACTIVE',
    approvalStatus: '',
    essayGradingRubric: question.essayGradingRubric ?? null,
    options: question.options ?? [],
    createdAt: null,
    updatedAt: null,
  };
}

export function ManagerQuestionIssuesPage() {
  const { user } = useAuth();
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState(EMPTY_FILTERS);
  const [page, setPage] = useState(0);
  const [list, setList] = useState<any>(null);
  const [courses, setCourses] = useState<CourseSummaryItem[]>([]);
  const [selectedRow, setSelectedRow] = useState<any>(null);
  const [detail, setDetail] = useState<any>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [jobs, setJobs] = useState<any[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [duplicateCandidates, setDuplicateCandidates] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [resolutionType, setResolutionType] = useState('CONTENT_CORRECTED');
  const [resolutionNote, setResolutionNote] = useState('');
  const [questionDraft, setQuestionDraft] = useState<QuestionDraft | null>(null);
  const [showQuestionErrors, setShowQuestionErrors] = useState(false);
  const [duplicateId, setDuplicateId] = useState('');
  const [duplicateNote, setDuplicateNote] = useState('');
  const [jobReason, setJobReason] = useState('');
  const openVersion = useRef(0);

  const load = useCallback(async (targetPage = page, selectedFilters = appliedFilters) => {
    setBusy(true);
    setError('');
    try {
      const query: Record<string, string | number> = { page: targetPage, size: 20, sort: 'createdAt,desc' };
      Object.entries(selectedFilters).forEach(([key, value]) => {
        if (value && value !== 'ALL') query[key] = value;
      });
      setList(await questionIssueService.managerList(query));
    } catch (e) {
      setError(getApiErrorMessage(e, 'Could not load the issue queue.'));
    } finally {
      setBusy(false);
    }
  }, [appliedFilters, page]);

  useEffect(() => { void load(page, appliedFilters); }, [load]);

  useEffect(() => {
    let cancelled = false;
    courseService.getCourses({ page: 0, size: 100, sort: 'title,asc' }).then(result => {
      if (!cancelled) setCourses(result.content);
    }).catch(() => {
      if (!cancelled) setCourses([]);
    });
    return () => { cancelled = true; };
  }, []);

  async function open(row: any) {
    const requestVersion = ++openVersion.current;
    setSelectedRow(row);
    setDetail(null);
    setDetailLoading(true);
    setJobs([]);
    setHistory([]);
    setDuplicateCandidates([]);
    setError('');
    setNote('');
    setResolutionType('CONTENT_CORRECTED');
    setResolutionNote('');
    setQuestionDraft(null);
    setShowQuestionErrors(false);
    setDuplicateId('');
    setDuplicateNote('');
    try {
      const ticket = await questionIssueService.managerDetail(row.issueId);
      if (requestVersion !== openVersion.current) return;
      setDetail(ticket);
      setQuestionDraft(fromDetail(toQuestionDetail(ticket)));
      const requests: Promise<any>[] = [questionIssueService.history(row.issueId), questionIssueService.jobs(row.issueId)];
      if (ticket.courseId) requests.push(questionIssueService.managerList({ status: 'ALL', courseId: ticket.courseId, page: 0, size: 100, sort: 'createdAt,desc' }));
      const [historyResult, jobsResult, candidatesResult] = await Promise.allSettled(requests);
      if (requestVersion !== openVersion.current) return;
      if (historyResult.status === 'fulfilled') setHistory(unwrapList(historyResult.value));
      if (jobsResult.status === 'fulfilled') setJobs(unwrapList(jobsResult.value));
      if (candidatesResult?.status === 'fulfilled') {
        setDuplicateCandidates(unwrapList(candidatesResult.value).filter((candidate: any) => candidate.issueId !== ticket.issueId && candidate.status !== 'DUPLICATE'));
      }
    } catch (e) {
      if (requestVersion === openVersion.current) setError(getApiErrorMessage(e, 'Could not load this ticket.'));
    } finally {
      if (requestVersion === openVersion.current) setDetailLoading(false);
    }
  }

  function closeDetail() {
    openVersion.current += 1;
    setSelectedRow(null);
    setDetail(null);
    setDetailLoading(false);
    setError('');
  }

  async function act(action: () => Promise<any>, errorMessage: string) {
    setBusy(true);
    setError('');
    try {
      await action();
      if (detail) await open(detail);
      await load(page, appliedFilters);
    } catch (e) {
      setError(getApiErrorMessage(e, errorMessage));
    } finally {
      setBusy(false);
    }
  }

  async function resolve() {
    if (!detail || !questionDraft) return;
    let changes: Record<string, unknown> = {};
    if (resolutionType === 'CONTENT_CORRECTED') {
      if (!questionDraft.content.trim()) { setError('Enter the corrected question text.'); return; }
      changes = { content: questionDraft.content.trim() };
    } else if (resolutionType === 'EXPLANATION_CORRECTED' || resolutionType === 'AI_EXPLANATION_CORRECTED') {
      if (!questionDraft.explanation.trim()) { setError('Enter the corrected explanation.'); return; }
      changes = { explanation: questionDraft.explanation.trim() };
    } else if (resolutionType === 'ANSWER_CORRECTED') {
      if (!isDraftValid(questionDraft)) { setShowQuestionErrors(true); setError('Review the answer fields before resolving this ticket.'); return; }
      const request = toCreateRequest(questionDraft, detail.courseId ?? 0, null);
      changes = { options: request.options ?? [], answerKey: request.answerKey ?? null };
    } else if (resolutionType === 'RUBRIC_CORRECTED') {
      if (!isDraftValid(questionDraft)) { setShowQuestionErrors(true); setError('Review the rubric before resolving this ticket.'); return; }
      const request = toCreateRequest(questionDraft, detail.courseId ?? 0, null);
      changes = { essayGradingRubric: request.essayGradingRubric ?? null };
    } else if (resolutionType === 'OTHER_CORRECTION') {
      if (!isDraftValid(questionDraft)) { setShowQuestionErrors(true); setError('Review the question fields before resolving this ticket.'); return; }
      const request = toCreateRequest(questionDraft, detail.courseId ?? 0, null);
      changes = {
        content: request.content,
        explanation: request.explanation,
        difficulty: request.difficulty,
        options: request.options ?? [],
        answerKey: request.answerKey ?? null,
        questionMetadata: request.questionMetadata,
        essayGradingRubric: request.essayGradingRubric,
      };
    }
    await act(() => questionIssueService.resolve(detail.issueId, {
      resolutionType,
      resolutionNote: resolutionNote.trim(),
      expectedLockVersion: detail.question?.lockVersion ?? detail.questionLockVersion,
      changes,
    }), 'Could not resolve this ticket.');
  }

  const rows = unwrapList(list);
  const pages = list?.totalPages ?? 1;
  const status = detail?.status;
  const courseOptions = useMemo(() => [
    { label: 'All courses', value: '' },
    ...courses.map(course => ({ label: course.title, value: String(course.courseId) })),
  ], [courses]);
  const duplicateOptions = useMemo(() => [
    { label: 'Choose the primary ticket', value: '' },
    ...duplicateCandidates.map((candidate: any) => ({
      label: `Question #${candidate.questionId} · ${candidate.questionContent || 'Question content unavailable'}`,
      value: String(candidate.issueId),
    })),
  ], [duplicateCandidates]);
  const resolutionOptions = RESOLUTION_TYPES.map(value => ({ label: issueLabel(value), value }));
  const fullQuestionEditor = ['ANSWER_CORRECTED', 'RUBRIC_CORRECTED', 'OTHER_CORRECTION'].includes(resolutionType);

  return <main className="mx-auto max-w-screen-2xl space-y-6 p-6 lg:p-8">
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold text-content">Question issue queue</h1>
        <p className="mt-1 text-sm text-content-secondary">Review student reports, correct affected questions, and monitor regrade work.</p>
      </div>
      <span className="rounded-lg bg-surface-muted px-3 py-2 text-sm text-content-secondary">{list?.totalElements ?? 0} tickets</span>
    </header>

    {error && !selectedRow && <Alert type="error" message={error} />}

    <section className="overflow-hidden rounded-xl border border-line bg-surface shadow-sm">
      <form className="grid gap-4 border-b border-line p-4 sm:p-5 lg:grid-cols-[minmax(140px,.65fr)_minmax(190px,1fr)_minmax(200px,1.25fr)_minmax(220px,1.5fr)_auto] lg:items-end" onSubmit={event => {
        event.preventDefault();
        setPage(0);
        setAppliedFilters({ ...filters });
      }}>
        <Select label="Status" value={filters.status} onChange={value => setFilters(current => ({ ...current, status: value }))} options={[
          { label: 'Pending', value: 'PENDING' },
          ...ISSUE_STATUSES.filter(value => value !== 'PENDING').map(value => ({ label: issueLabel(value), value })),
          { label: 'All statuses', value: 'ALL' },
        ]} triggerClassName="w-full h-10 pl-3 pr-10 rounded-lg text-sm" />
        <Select label="Issue type" value={filters.issueType} onChange={value => setFilters(current => ({ ...current, issueType: value }))} options={[
          { label: 'All issue types', value: '' },
          ...ISSUE_TYPES.map(value => ({ label: issueLabel(value), value })),
        ]} triggerClassName="w-full h-10 pl-3 pr-10 rounded-lg text-sm" />
        <SearchableSelect label="Course" options={courseOptions} value={filters.courseId} onChange={value => setFilters(current => ({ ...current, courseId: value }))} placeholder="All courses" searchPlaceholder="Search courses…" />
        <label className="grid gap-1.5 text-sm font-medium text-content-secondary">Search questions and reports
          <input className="h-10 rounded-lg border border-line bg-surface px-3 text-sm text-content placeholder:text-content-subtle" placeholder="Enter a question or report phrase" value={filters.search} onChange={event => setFilters(current => ({ ...current, search: event.target.value }))} />
        </label>
        <div className="flex gap-2 lg:justify-end">
          <Button type="button" variant="outline" disabled={busy} onClick={() => {
            setFilters({ ...EMPTY_FILTERS });
            setAppliedFilters({ ...EMPTY_FILTERS });
            setPage(0);
          }}>Clear</Button>
          <Button type="submit" loading={busy}>Apply filters</Button>
        </div>
      </form>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[850px] text-left text-sm">
          <thead className="bg-surface-muted text-content-secondary"><tr>
            <th className="px-5 py-3 font-medium">Question and issue</th>
            <th className="px-5 py-3 font-medium">Course</th>
            <th className="px-5 py-3 font-medium">Reports</th>
            <th className="px-5 py-3 font-medium">Updated</th>
            <th className="px-5 py-3 font-medium">Status</th>
            <th className="px-5 py-3"><span className="sr-only">Review</span></th>
          </tr></thead>
          <tbody className="divide-y divide-line">
            {rows.map((row: any) => <tr key={row.issueId} className="hover:bg-surface-hover">
              <td className="max-w-xl px-5 py-4">
                <div className="flex flex-wrap items-center gap-2"><span className="font-semibold text-content">{row.questionContent || row.question?.content || 'Question content unavailable'}</span><span className="text-xs text-content-subtle">Question #{row.questionId}</span></div>
                <p className="mt-1 text-xs text-content-secondary">{issueLabel(row.issueType)} · Ticket #{row.issueId}</p>
              </td>
              <td className="max-w-xs truncate px-5 py-4 text-content-secondary">{row.courseName || row.course?.name || '—'}</td>
              <td className="whitespace-nowrap px-5 py-4 text-content-secondary">{row.reportCount ?? 0}</td>
              <td className="whitespace-nowrap px-5 py-4 text-content-secondary">{row.updatedAt || row.createdAt ? new Date(row.updatedAt || row.createdAt).toLocaleDateString() : '—'}</td>
              <td className="px-5 py-4"><Status value={row.status} /></td>
              <td className="px-5 py-4 text-right"><Button size="sm" variant="outline" onClick={() => void open(row)}>Review</Button></td>
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

    <Modal open={!!selectedRow} onClose={closeDetail} title={detail ? `Ticket #${detail.issueId} · Question #${detail.questionId}` : 'Loading ticket…'} size="screen" error={error && selectedRow ? <Alert type="error" message={error} /> : undefined} footer={detail && <Button variant="outline" onClick={closeDetail} disabled={busy}>Close ticket</Button>}>
      {!detail ? <div className="py-16 text-center text-sm text-content-secondary">{detailLoading ? 'Loading ticket details…' : 'Ticket details are unavailable.'}</div> : <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,.8fr)]">
        <div className="min-w-0 space-y-5">
          <section className="rounded-xl border border-line bg-surface-muted p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div><p className="text-xs font-semibold uppercase tracking-wide text-content-secondary">{issueLabel(detail.issueType || detail.reports?.[0]?.issueType)}</p><p className="mt-1 text-sm text-content-secondary">{detail.courseName || `Course #${detail.courseId ?? '—'}`} · Question version {detail.question?.lockVersion ?? '—'}</p></div>
              <Status value={status} />
            </div>
            <p className="mt-4 whitespace-pre-wrap text-sm font-medium leading-6 text-content">{detail.question?.content || 'Question content unavailable'}</p>
            <details className="mt-4 rounded-lg border border-line bg-surface p-3">
              <summary className="cursor-pointer text-sm font-semibold text-content">View answers and scoring details</summary>
              {questionDraft && <div className="mt-4"><QuestionForm q={questionDraft} index={0} heading="Question" onChange={() => undefined} showErrors={false} readOnly /></div>}
            </details>
          </section>

          <section>
            <h3 className="text-sm font-semibold text-content">Student reports <span className="font-normal text-content-subtle">({detail.reports?.length ?? detail.reportCount ?? 0})</span></h3>
            <div className="mt-3 space-y-3">
              {(detail.reports || []).map((report: any) => <article key={report.reportId} className="rounded-xl border border-line p-4">
                <div className="flex flex-wrap justify-between gap-2 text-xs text-content-secondary"><span className="font-medium">{report.student?.fullName || report.studentName || `Student #${report.userId ?? '—'}`}</span><time>{report.createdAt ? new Date(report.createdAt).toLocaleString() : ''}</time></div>
                <p className="mt-2 whitespace-pre-wrap text-sm text-content">{report.description}</p>
                {report.attachmentUrl && <a href={report.attachmentUrl} target="_blank" rel="noreferrer" className="mt-3 inline-flex text-sm text-brand-700 underline">View attachment</a>}
              </article>)}
              {!detail.reports?.length && <p className="rounded-lg bg-surface-muted p-4 text-sm text-content-secondary">No report details were returned.</p>}
            </div>
          </section>

          {status === 'IN_PROGRESS' && <section className="space-y-4 rounded-xl border border-line p-4">
            <div><h3 className="font-semibold text-content">Resolve ticket</h3><p className="mt-1 text-sm text-content-secondary">Choose the correction type, edit the relevant fields, and leave a resolution note for reporters.</p></div>
            <Select label="Resolution" value={resolutionType} onChange={value => { setResolutionType(value); setError(''); }} options={resolutionOptions} triggerClassName="w-full h-10 pl-3 pr-10 rounded-lg text-sm" />
            {resolutionType === 'CONTENT_CORRECTED' && questionDraft && <label className="grid gap-1.5 text-sm font-medium text-content-secondary">Corrected question text<textarea rows={5} value={questionDraft.content} onChange={event => setQuestionDraft(current => current ? { ...current, content: event.target.value } : current)} className="rounded-lg border border-line bg-surface p-3 text-sm text-content" /></label>}
            {(resolutionType === 'EXPLANATION_CORRECTED' || resolutionType === 'AI_EXPLANATION_CORRECTED') && questionDraft && <label className="grid gap-1.5 text-sm font-medium text-content-secondary">Corrected explanation<textarea rows={5} value={questionDraft.explanation} onChange={event => setQuestionDraft(current => current ? { ...current, explanation: event.target.value } : current)} className="rounded-lg border border-line bg-surface p-3 text-sm text-content" /></label>}
            {fullQuestionEditor && questionDraft && <div className="rounded-lg border border-line p-3"><p className="mb-3 text-sm text-content-secondary">Edit the question using the same structured fields used to create it.</p><QuestionForm q={questionDraft} index={0} heading="Question correction" onChange={next => setQuestionDraft(next)} showErrors={showQuestionErrors} allowedTypes={[questionDraft.type]} /></div>}
            {resolutionType === 'QUESTION_VOIDED' && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">This will void the question and update its scoring version. No question edits are required.</p>}
            <label className="grid gap-1.5 text-sm font-medium text-content-secondary">Resolution note<textarea rows={3} value={resolutionNote} onChange={event => setResolutionNote(event.target.value)} className="rounded-lg border border-line bg-surface p-3 text-sm text-content" placeholder="Explain what was corrected and why." /></label>
            <Button loading={busy} disabled={!resolutionNote.trim() || detailLoading} onClick={() => void resolve()}>Resolve and save</Button>
          </section>}
        </div>

        <aside className="min-w-0 space-y-5">
          <section className="rounded-xl border border-line p-4">
            <h3 className="text-sm font-semibold text-content">Ticket actions</h3>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button variant="outline" size="sm" disabled={busy || status === 'RESOLVED' || status === 'REJECTED' || status === 'DUPLICATE'} onClick={() => {
                if (!detail || !user) return;
                void act(() => questionIssueService.assign(detail.issueId, user.userId), 'Could not assign this ticket.');
              }}>Assign to me</Button>
              {status === 'PENDING' && <Button size="sm" loading={busy} onClick={() => {
                if (!detail) return;
                void act(() => questionIssueService.status(detail.issueId, 'IN_PROGRESS', note.trim()), 'Could not start ticket review.');
              }}>Start review</Button>}
            </div>
            {status === 'PENDING' && <label className="mt-3 grid gap-1.5 text-sm font-medium text-content-secondary">Review note <span className="font-normal text-content-subtle">Optional</span><textarea rows={2} className="rounded-lg border border-line bg-surface p-3 text-sm text-content" value={note} onChange={event => setNote(event.target.value)} placeholder="Add a note while taking ownership" /></label>}
            {status === 'IN_PROGRESS' && <div className="mt-3 space-y-2"><label className="grid gap-1.5 text-sm font-medium text-content-secondary">Rejection reason<textarea rows={3} className="rounded-lg border border-line bg-surface p-3 text-sm text-content" value={note} onChange={event => setNote(event.target.value)} placeholder="Explain why this report is rejected" /></label><Button variant="danger" size="sm" loading={busy} disabled={!note.trim()} onClick={() => void act(() => questionIssueService.status(detail.issueId, 'REJECTED', note.trim()), 'Could not reject this ticket.')}>Reject ticket</Button></div>}
            {status === 'IN_PROGRESS' && <details className="mt-4 border-t border-line pt-3">
              <summary className="cursor-pointer text-sm font-semibold text-content">Mark as duplicate</summary>
              <div className="mt-3 space-y-3">
                <SearchableSelect label="Primary ticket" options={duplicateOptions} value={duplicateId} onChange={setDuplicateId} placeholder="Choose a ticket" searchPlaceholder="Search tickets by question…" emptyText="No other tickets in this course" />
                <label className="grid gap-1.5 text-sm font-medium text-content-secondary">Reason<input value={duplicateNote} onChange={event => setDuplicateNote(event.target.value)} placeholder="Why is this a duplicate?" className="h-10 rounded-lg border border-line bg-surface px-3 text-sm text-content" /></label>
                <Button variant="outline" size="sm" disabled={!duplicateId || !duplicateNote.trim()} loading={busy} onClick={() => void act(() => questionIssueService.duplicate(detail.issueId, Number(duplicateId), duplicateNote.trim()), 'Could not mark this ticket as a duplicate.')}>Mark duplicate</Button>
              </div>
            </details>}
          </section>

          <section className="rounded-xl border border-line p-4">
            <h3 className="text-sm font-semibold text-content">Regrade jobs</h3>
            <div className="mt-3 space-y-3">
              {jobs.map((job: any) => <article key={job.jobId} className="rounded-lg bg-surface-muted p-3 text-xs">
                <div className="flex justify-between gap-2"><b>Job #{job.jobId} · {issueLabel(job.status)}</b><span>{job.progressPercent ?? 0}%</span></div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface"><div className="h-full bg-brand-600" style={{ width: `${Math.min(100, Math.max(0, job.progressPercent ?? 0))}%` }} /></div>
                <p className="mt-2 text-content-secondary">{job.processedAnswers ?? 0}/{job.totalAnswers ?? 0} processed · {job.failedAnswers ?? 0} failed</p>
                {job.status === 'PENDING_CONFIRMATION' && <div className="mt-3 space-y-2"><label className="grid gap-1 text-content-secondary">Confirmation reason<input className="rounded border border-line bg-surface px-2 py-1.5" value={jobReason} onChange={event => setJobReason(event.target.value)} /></label><Button size="sm" disabled={!jobReason.trim()} loading={busy} onClick={() => void act(() => questionIssueService.confirmRegrade(detail.issueId, job.jobId, true, jobReason.trim()), 'Could not confirm regrade.')}>Confirm regrade</Button></div>}
                {['FAILED', 'PARTIAL_FAILED'].includes(job.status) && <Button className="mt-2" size="sm" variant="outline" loading={busy} onClick={() => void act(() => questionIssueService.retryJob(job.jobId), 'Could not retry this job.')}>Retry job</Button>}
              </article>)}
              {!jobs.length && <p className="text-sm text-content-secondary">No regrade jobs.</p>}
            </div>
          </section>

          <section className="rounded-xl border border-line p-4">
            <h3 className="text-sm font-semibold text-content">Ticket history</h3>
            <div className="mt-3 max-h-64 space-y-3 overflow-y-auto">
              {history.map((entry: any, index: number) => <div key={entry.historyId ?? index} className="border-l-2 border-line pl-3 text-sm"><div className="flex flex-wrap justify-between gap-2"><b>{issueLabel(entry.action || entry.status)}</b><time className="text-xs text-content-subtle">{entry.createdAt ? new Date(entry.createdAt).toLocaleString() : ''}</time></div>{(entry.actor?.fullName || entry.note || entry.description) && <p className="mt-1 whitespace-pre-wrap text-xs text-content-secondary">{entry.actor?.fullName ? `${entry.actor.fullName} · ` : ''}{entry.note || entry.description || ''}</p>}</div>)}
              {!history.length && <p className="text-sm text-content-secondary">No history entries.</p>}
            </div>
          </section>
        </aside>
      </div>}
    </Modal>
  </main>;
}
