import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { getApiErrorMessage } from '@/utils/apiError';
import { ISSUE_STATUSES, ISSUE_TYPES, issueLabel, questionIssueService } from '@/services/questionIssue.service';
import { useAuth } from '@/auth/authContext';

const RESOLUTION_TYPES = ['CONTENT_CORRECTED', 'EXPLANATION_CORRECTED', 'AI_EXPLANATION_CORRECTED', 'ANSWER_CORRECTED', 'RUBRIC_CORRECTED', 'QUESTION_VOIDED', 'OTHER_CORRECTION'];
function Status({ value = '' }: { value?: string }) { const color = value === 'RESOLVED' ? 'bg-emerald-50 text-emerald-700' : value === 'REJECTED' ? 'bg-red-50 text-red-700' : value === 'IN_PROGRESS' ? 'bg-blue-50 text-blue-700' : value === 'DUPLICATE' ? 'bg-slate-100 text-slate-600' : 'bg-amber-50 text-amber-800'; return <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${color}`}>{issueLabel(value)}</span>; }
function unwrapList(v: any) { return Array.isArray(v) ? v : v?.content ?? v?.items ?? []; }

export function ManagerQuestionIssuesPage() {
  const { user } = useAuth();
  const [filters, setFilters] = useState({ status: 'PENDING', issueType: '', courseId: '', questionId: '', search: '' });
  const [page, setPage] = useState(0);
  const [list, setList] = useState<any>(null);
  const [detail, setDetail] = useState<any>(null);
  const [jobs, setJobs] = useState<any[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [resolutionType, setResolutionType] = useState('CONTENT_CORRECTED');
  const [resolutionNote, setResolutionNote] = useState('');
  const [changesJson, setChangesJson] = useState('{}');
  const [duplicateId, setDuplicateId] = useState('');
  const [duplicateNote, setDuplicateNote] = useState('');
  const [jobReason, setJobReason] = useState('');

  const load = useCallback(async (targetPage = page) => {
    setBusy(true); setError('');
    try { const query: Record<string, string | number> = { page: targetPage, size: 20, sort: 'createdAt,desc' }; Object.entries(filters).forEach(([k, v]) => { if (v && v !== 'ALL') query[k] = v; }); setList(await questionIssueService.managerList(query)); }
    catch (e) { setError(getApiErrorMessage(e, 'Could not load the issue queue.')); }
    finally { setBusy(false); }
  }, [filters, page]);
  useEffect(() => { void load(0); setPage(0); }, [filters.status, filters.issueType]);
  useEffect(() => { void load(); }, [page]);
  async function open(row: any) {
    setError(''); setDetail(null); setJobs([]); setHistory([]);
    try { const d = await questionIssueService.managerDetail(row.issueId); setDetail(d); setResolutionNote(''); setResolutionType('CONTENT_CORRECTED'); setChangesJson(JSON.stringify(d.question ? {} : {}, null, 2)); setDuplicateId(''); setDuplicateNote('');
      const [h, j] = await Promise.allSettled([questionIssueService.history(row.issueId), questionIssueService.jobs(row.issueId)]);
      if (h.status === 'fulfilled') setHistory(unwrapList(h.value)); if (j.status === 'fulfilled') setJobs(unwrapList(j.value));
    } catch (e) { setError(getApiErrorMessage(e, 'Could not load this ticket.')); }
  }
  async function act(fn: () => Promise<any>, successText: string) {
    setBusy(true); setError(''); try { await fn(); if (detail) await open(detail); await load(); } catch (e) { setError(getApiErrorMessage(e, successText)); } finally { setBusy(false); }
  }
  async function assign() { if (!detail || !user) return; await act(() => questionIssueService.assign(detail.issueId, user.userId), 'Could not assign this ticket.'); }
  async function startReview() { if (!detail) return; await act(() => questionIssueService.status(detail.issueId, 'IN_PROGRESS', note.trim()), 'Could not update ticket status.'); setNote(''); }
  async function resolve() {
    if (!detail) return;
    let changes: any; try { changes = JSON.parse(changesJson); if (!changes || typeof changes !== 'object' || Array.isArray(changes)) throw new Error(); }
    catch { setError('Question changes must be a valid JSON object.'); return; }
    await act(() => questionIssueService.resolve(detail.issueId, { resolutionType, resolutionNote: resolutionNote.trim(), expectedLockVersion: detail.question?.lockVersion ?? detail.question?.version ?? detail.questionLockVersion, changes }), 'Could not resolve this ticket.');
  }
  const rows = unwrapList(list); const pages = list?.totalPages ?? 1; const status = detail?.status;
  return <main className="space-y-5 p-6 lg:p-8">
    <header><h1 className="text-2xl font-bold text-content">Question issue queue</h1><p className="mt-1 text-sm text-content-secondary">Review reports, update affected questions, and track regrade work for your courses.</p></header>
    {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}<button className="ml-2 underline" onClick={() => void load()}>Refresh queue</button></div>}
    <div className="grid gap-5 2xl:grid-cols-[minmax(0,1fr)_minmax(420px,.95fr)]">
      <section className="overflow-hidden rounded-xl border border-line bg-surface">
        <div className="flex flex-wrap items-end gap-3 border-b border-line p-4">
          <label className="grid gap-1 text-xs font-medium text-content-secondary">Status<select className="rounded-lg border border-line bg-surface px-3 py-2 text-sm text-content" value={filters.status} onChange={e => setFilters(f => ({ ...f, status: e.target.value }))}><option value="ALL">All statuses</option>{ISSUE_STATUSES.map(x => <option key={x}>{x}</option>)}</select></label>
          <label className="grid gap-1 text-xs font-medium text-content-secondary">Issue type<select className="rounded-lg border border-line bg-surface px-3 py-2 text-sm text-content" value={filters.issueType} onChange={e => setFilters(f => ({ ...f, issueType: e.target.value }))}><option value="">All types</option>{ISSUE_TYPES.map(x => <option key={x}>{x}</option>)}</select></label>
          <label className="grid min-w-32 flex-1 gap-1 text-xs font-medium text-content-secondary">Search<input className="rounded-lg border border-line bg-surface px-3 py-2 text-sm text-content" placeholder="Question or report" value={filters.search} onChange={e => setFilters(f => ({ ...f, search: e.target.value }))} onKeyDown={e => e.key === 'Enter' && void load(0)} /></label>
          <label className="grid w-28 gap-1 text-xs font-medium text-content-secondary">Course ID<input inputMode="numeric" className="rounded-lg border border-line bg-surface px-3 py-2 text-sm text-content" value={filters.courseId} onChange={e => setFilters(f => ({ ...f, courseId: e.target.value }))} /></label>
          <label className="grid w-28 gap-1 text-xs font-medium text-content-secondary">Question ID<input inputMode="numeric" className="rounded-lg border border-line bg-surface px-3 py-2 text-sm text-content" value={filters.questionId} onChange={e => setFilters(f => ({ ...f, questionId: e.target.value }))} /></label>
          <Button variant="outline" onClick={() => { setPage(0); void load(0); }} loading={busy}>Apply</Button>
        </div>
        <div className="divide-y divide-line">{rows.map((row: any) => <button key={row.issueId} onClick={() => void open(row)} className={`w-full p-4 text-left hover:bg-surface-hover ${detail?.issueId === row.issueId ? 'bg-accent' : ''}`}><div className="flex flex-wrap items-center justify-between gap-2"><span className="font-semibold text-content">Question #{row.questionId} · {issueLabel(row.issueType)}</span><Status value={row.status} /></div><p className="mt-1 line-clamp-2 text-sm text-content-secondary">{row.questionContent || row.question?.content || 'Question content unavailable'}</p><div className="mt-2 flex flex-wrap gap-x-3 text-xs text-content-subtle"><span>Ticket #{row.issueId}</span><span>{row.courseName || row.course?.name || (row.courseId ? `Course #${row.courseId}` : '')}</span><span>{row.reportCount ?? 0} reports</span><span>{row.createdAt ? new Date(row.createdAt).toLocaleDateString() : ''}</span></div></button>)}
          {!rows.length && <p className="p-10 text-center text-sm text-content-secondary">{busy ? 'Loading tickets…' : 'No tickets match these filters.'}</p>}
        </div>
        <div className="flex items-center justify-between border-t border-line p-3 text-sm"><span>{list?.totalElements ?? rows.length} tickets</span><div className="flex items-center gap-2"><Button size="sm" variant="outline" disabled={page <= 0 || busy} onClick={() => setPage(p => p - 1)}>Previous</Button><span>{page + 1} / {Math.max(1, pages)}</span><Button size="sm" variant="outline" disabled={page + 1 >= pages || busy} onClick={() => setPage(p => p + 1)}>Next</Button></div></div>
      </section>
      <section className="min-h-[32rem] rounded-xl border border-line bg-surface p-5">
        {!detail ? <div className="grid min-h-96 place-items-center text-center text-sm text-content-secondary">Choose a ticket to inspect reports and take action.</div> : <>
          <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wide text-content-secondary">Ticket #{detail.issueId} · Question #{detail.questionId}</p><h2 className="mt-1 text-xl font-bold text-content">{issueLabel(detail.issueType || detail.reports?.[0]?.issueType)}</h2></div><Status value={status} /></div>
          <div className="mt-4 rounded-lg bg-surface-muted p-4"><h3 className="text-xs font-semibold uppercase tracking-wide text-content-secondary">Question</h3><p className="mt-2 whitespace-pre-wrap text-sm text-content">{detail.question?.content || detail.questionContent || 'Question content unavailable'}</p><p className="mt-2 text-xs text-content-secondary">Version {detail.question?.lockVersion ?? detail.question?.version ?? detail.questionLockVersion ?? '—'} · {detail.course?.name || detail.courseName || `Course #${detail.courseId ?? '—'}`}</p></div>
          <div className="mt-4"><h3 className="text-sm font-semibold">Student reports ({detail.reports?.length ?? detail.reportCount ?? 0})</h3><div className="mt-2 max-h-48 space-y-2 overflow-auto">{(detail.reports || []).map((r: any) => <div key={r.reportId} className="rounded-lg border border-line p-3"><div className="flex justify-between gap-2 text-xs text-content-secondary"><span>{r.student?.fullName || r.studentName || `Student #${r.userId ?? '—'}`}</span><span>{r.createdAt ? new Date(r.createdAt).toLocaleString() : ''}</span></div><p className="mt-2 whitespace-pre-wrap text-sm">{r.description}</p>{r.attachmentUrl && <a href={r.attachmentUrl} target="_blank" rel="noreferrer" className="mt-2 inline-block text-sm text-brand-700 underline">View attachment</a>}</div>)}{!detail.reports?.length && <p className="text-sm text-content-secondary">No report details returned.</p>}</div></div>
          <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-4"><Button variant="outline" size="sm" disabled={busy || status === 'RESOLVED' || status === 'REJECTED' || status === 'DUPLICATE'} onClick={() => void assign()}>Assign to me</Button>{status === 'PENDING' && <div className="flex min-w-52 flex-1 gap-2"><input className="min-w-0 flex-1 rounded-lg border border-line px-3 py-2 text-sm" placeholder="Optional review note" value={note} onChange={e => setNote(e.target.value)} /><Button size="sm" loading={busy} onClick={() => void startReview()}>Start review</Button></div>}{status === 'IN_PROGRESS' && <div className="flex min-w-52 flex-1 gap-2"><input className="min-w-0 flex-1 rounded-lg border border-line px-3 py-2 text-sm" placeholder="Reason for rejection" value={note} onChange={e => setNote(e.target.value)} /><Button variant="danger" size="sm" loading={busy} disabled={!note.trim()} onClick={() => void act(() => questionIssueService.status(detail.issueId, 'REJECTED', note.trim()), 'Could not reject this ticket.')}>Reject ticket</Button></div>}</div>
          {status === 'IN_PROGRESS' && <div className="mt-4 space-y-4 border-t border-line pt-4"><h3 className="font-semibold">Resolve ticket</h3><div className="grid gap-3 sm:grid-cols-2"><label className="grid gap-1 text-xs font-medium text-content-secondary">Resolution<select className="rounded-lg border border-line bg-surface px-3 py-2 text-sm text-content" value={resolutionType} onChange={e => setResolutionType(e.target.value)}>{RESOLUTION_TYPES.map(x => <option key={x}>{x}</option>)}</select></label><label className="grid gap-1 text-xs font-medium text-content-secondary">Question changes (JSON)<textarea rows={3} className="rounded-lg border border-line bg-surface px-3 py-2 font-mono text-xs text-content sm:col-span-2" value={changesJson} onChange={e => setChangesJson(e.target.value)} placeholder={'{ "content": "Updated question text" }'} /></label></div><label className="grid gap-1 text-xs font-medium text-content-secondary">Resolution note<textarea rows={3} value={resolutionNote} onChange={e => setResolutionNote(e.target.value)} className="rounded-lg border border-line bg-surface px-3 py-2 text-sm text-content" placeholder="Explain what was corrected and why." /></label><Button loading={busy} disabled={!resolutionNote.trim()} onClick={() => void resolve()}>Resolve and save changes</Button>
            <details className="rounded-lg border border-line p-3"><summary className="cursor-pointer text-sm font-semibold">Mark as duplicate</summary><div className="mt-3 grid gap-2 sm:grid-cols-2"><input inputMode="numeric" value={duplicateId} onChange={e => setDuplicateId(e.target.value)} placeholder="Primary ticket ID" className="rounded-lg border border-line px-3 py-2 text-sm"/><input value={duplicateNote} onChange={e => setDuplicateNote(e.target.value)} placeholder="Reason" className="rounded-lg border border-line px-3 py-2 text-sm"/><Button variant="outline" size="sm" disabled={!duplicateId || !duplicateNote.trim()} loading={busy} onClick={() => void act(() => questionIssueService.duplicate(detail.issueId, Number(duplicateId), duplicateNote.trim()), 'Could not mark this ticket as a duplicate.')}>Confirm duplicate</Button></div></details>
          </div>}
          <div className="mt-5 grid gap-4 border-t border-line pt-4 lg:grid-cols-2"><div><h3 className="text-sm font-semibold">Regrade jobs</h3><div className="mt-2 space-y-2">{jobs.map((job: any) => <div key={job.jobId} className="rounded-lg border border-line p-3 text-xs"><div className="flex justify-between"><b>Job #{job.jobId} · {issueLabel(job.status)}</b><span>{job.progressPercent ?? 0}%</span></div><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-muted"><div className="h-full bg-brand-600" style={{ width: `${Math.min(100, Math.max(0, job.progressPercent ?? 0))}%` }} /></div><p className="mt-2 text-content-secondary">{job.processedAnswers ?? 0}/{job.totalAnswers ?? 0} processed · {job.failedAnswers ?? 0} failed</p>{job.status === 'PENDING_CONFIRMATION' && <div className="mt-2 space-y-2"><input className="w-full rounded border border-line px-2 py-1" value={jobReason} onChange={e => setJobReason(e.target.value)} placeholder="Confirmation reason"/><Button size="sm" disabled={!jobReason.trim()} loading={busy} onClick={() => void act(() => questionIssueService.confirmRegrade(detail.issueId, job.jobId, true, jobReason.trim()), 'Could not confirm regrade.')}>Confirm regrade</Button></div>}{['FAILED','PARTIAL_FAILED'].includes(job.status) && <Button className="mt-2" size="sm" variant="outline" loading={busy} onClick={() => void act(() => questionIssueService.retryJob(job.jobId), 'Could not retry this job.')}>Retry job</Button>}</div>)}{!jobs.length && <p className="text-xs text-content-secondary">No regrade jobs.</p>}</div></div><div><h3 className="text-sm font-semibold">Ticket history</h3><div className="mt-2 max-h-48 space-y-2 overflow-auto">{history.map((h: any, i: number) => <div key={h.historyId ?? i} className="border-l-2 border-line pl-3 text-xs"><b>{issueLabel(h.action || h.status)}</b><p className="text-content-secondary">{h.note || h.description || ''}{h.createdAt ? ` · ${new Date(h.createdAt).toLocaleString()}` : ''}</p></div>)}{!history.length && <p className="text-xs text-content-secondary">No history entries.</p>}</div></div></div>
        </>}
      </section>
    </div>
  </main>;
}
