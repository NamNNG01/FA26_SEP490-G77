import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { STUDENT_PAGE_CLASS, PageTitle, ListSkeleton } from '../components/studentUi';
import { ISSUE_STATUSES, issueLabel, questionIssueService } from '@/services/questionIssue.service';
import { getApiErrorMessage } from '@/utils/apiError';

const badge = (status = '') => <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${status === 'RESOLVED' ? 'bg-emerald-50 text-emerald-700' : status === 'REJECTED' ? 'bg-red-50 text-red-700' : status === 'IN_PROGRESS' ? 'bg-blue-50 text-blue-700' : status === 'DUPLICATE' ? 'bg-slate-100 text-slate-600' : 'bg-amber-50 text-amber-800'}`}>{issueLabel(status)}</span>;

export function StudentQuestionIssuesPage() {
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(0);
  const [data, setData] = useState<any>(null);
  const [selected, setSelected] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try { const res = await questionIssueService.studentList({ page, size: 20, ...(status ? { status } : {}) }); setData(res); }
    catch (e) { setError(getApiErrorMessage(e, 'Could not load your reports.')); }
    finally { setLoading(false); }
  }, [page, status]);
  useEffect(() => { void load(); }, [load]);
  async function open(row: any) {
    try { setSelected(await questionIssueService.studentDetail(row.issueId)); }
    catch (e) { setError(getApiErrorMessage(e, 'Could not load this report.')); }
  }
  const rows = data?.content ?? data?.items ?? [];
  const totalPages = data?.totalPages ?? 1;
  return <main className={`${STUDENT_PAGE_CLASS} space-y-5`}>
    <PageTitle title="My question reports" subtitle="Follow the status and outcome of issues you’ve reported." />
    <div className="flex flex-wrap items-end justify-between gap-3"><p className="text-sm text-content-secondary">Reports are private to your account.</p><label className="grid gap-1 text-xs font-medium text-content-secondary">Filter by status<select className="min-w-44 rounded-lg border border-line bg-surface px-3 py-2 text-sm text-content" value={status} onChange={e => { setStatus(e.target.value); setPage(0); setSelected(null); }}><option value="">All reports</option>{ISSUE_STATUSES.map(s => <option key={s} value={s}>{issueLabel(s)}</option>)}</select></label></div>
    {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}<button className="ml-2 underline" onClick={() => void load()}>Retry</button></div>}
    {loading && !data ? <ListSkeleton rows={5} /> : <section className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,.8fr)]">
      <div className="overflow-hidden rounded-xl border border-line bg-surface">
        <div className="divide-y divide-line">{rows.map((row: any) => <button key={row.issueId} onClick={() => void open(row)} className={`w-full p-4 text-left transition hover:bg-surface-hover ${selected?.issueId === row.issueId ? 'bg-accent' : ''}`}><div className="flex flex-wrap items-center justify-between gap-2"><span className="font-semibold text-content">Question #{row.questionId} · {issueLabel(row.issueType)}</span>{badge(row.status)}</div><p className="mt-1 line-clamp-2 text-sm text-content-secondary">{row.questionContent || row.question?.content || 'Question details unavailable'}</p><div className="mt-2 flex gap-3 text-xs text-content-subtle"><span>Report #{row.issueId}</span><span>{row.reportCount ?? 1} report{(row.reportCount ?? 1) === 1 ? '' : 's'}</span><span>{row.updatedAt ? new Date(row.updatedAt).toLocaleDateString() : ''}</span></div></button>)}
          {!rows.length && <div className="p-10 text-center"><div className="text-base font-semibold text-content">No reports found</div><p className="mt-1 text-sm text-content-secondary">Reports you submit from a question will appear here.</p></div>}
        </div>
        <div className="flex items-center justify-between border-t border-line p-3 text-sm"><span>{data?.totalElements ?? rows.length} report{(data?.totalElements ?? rows.length) === 1 ? '' : 's'}</span><div className="flex items-center gap-2"><Button size="sm" variant="outline" disabled={page <= 0 || loading} onClick={() => setPage(p => p - 1)}>Previous</Button><span>{page + 1} / {Math.max(1, totalPages)}</span><Button size="sm" variant="outline" disabled={page + 1 >= totalPages || loading} onClick={() => setPage(p => p + 1)}>Next</Button></div></div>
      </div>
      <article className="min-h-80 rounded-xl border border-line bg-surface p-5">{!selected ? <div className="grid min-h-64 place-items-center text-center text-sm text-content-secondary">Select a report to see its progress and resolution.</div> : <><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wide text-content-secondary">Report #{selected.issueId}</p><h2 className="mt-1 text-lg font-bold text-content">Question #{selected.questionId}</h2></div>{badge(selected.status)}</div><p className="mt-4 whitespace-pre-wrap rounded-lg bg-surface-muted p-3 text-sm text-content">{selected.question?.content || selected.questionContent || 'Question details unavailable'}</p><dl className="mt-4 grid grid-cols-2 gap-3 text-sm"><div><dt className="text-content-secondary">Issue type</dt><dd className="mt-1 font-medium">{issueLabel(selected.issueType || selected.reports?.[0]?.issueType)}</dd></div><div><dt className="text-content-secondary">Submitted</dt><dd className="mt-1 font-medium">{selected.createdAt ? new Date(selected.createdAt).toLocaleDateString() : '—'}</dd></div></dl>{(selected.myReports || selected.reports || []).map((report: any) => <div key={report.reportId} className="mt-4 border-t border-line pt-4"><h3 className="text-sm font-semibold">Your report</h3><p className="mt-2 whitespace-pre-wrap text-sm text-content-secondary">{report.description}</p>{report.attachmentUrl && <a className="mt-2 inline-block text-sm text-brand-700 underline" href={report.attachmentUrl} target="_blank" rel="noreferrer">View attachment</a>}</div>)}{selected.resolutionNote && <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-4"><h3 className="text-sm font-semibold text-emerald-900">Resolution</h3><p className="mt-1 whitespace-pre-wrap text-sm text-emerald-900">{selected.resolutionNote}</p></div>}</>}</article>
    </section>}
  </main>;
}
