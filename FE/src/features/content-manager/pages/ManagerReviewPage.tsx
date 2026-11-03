import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { apiClient } from '@/services/axios';
import { Button } from '@/components/ui/Button';

type Kind = 'contributions' | 'decks';
type Row = Record<string, any>;
const unwrap = (response: any) => {
  if (!response?.success) throw Object.assign(new Error(response?.message || 'Request failed'), { data: response?.data });
  return response.data;
};
const idOf = (row: Row, kind: Kind) => kind === 'contributions' ? row.contributionId : row.deckId;
const statusOf = (row: Row, kind: Kind) => kind === 'contributions' ? row.status : row.reviewStatus;

export function ManagerReviewPage() {
  const [params, setParams] = useSearchParams();
  const [kind, setKind] = useState<Kind>(params.get('kind') === 'decks' ? 'decks' : 'contributions');
  const [rows, setRows] = useState<Row[]>([]);
  const [detail, setDetail] = useState<Row | null>(null);
  const [pageData, setPageData] = useState<any>({ page: 0, totalPages: 0, totalElements: 0 });
  const [status, setStatus] = useState(params.get('status') || 'PENDING');
  const [keyword, setKeyword] = useState(params.get('keyword') || '');
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState('');
  const [rejecting, setRejecting] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async (nextPage = Number(params.get('page') || 0)) => {
    setBusy(true); setError('');
    try {
      const query = new URLSearchParams({ page: String(nextPage), size: '20', status });
      if (keyword.trim()) query.set('keyword', keyword.trim());
      const data = unwrap((await apiClient.get(`/manager/${kind}?${query}`)).data);
      setRows(data.content || []); setPageData(data); setDetail(null);
    } catch (e: any) { setError(e.message || 'Could not load review queue'); }
    finally { setBusy(false); }
  }, [kind, status, keyword, params]);

  useEffect(() => { setParams({ kind, status, ...(keyword ? { keyword } : {}), page: '0' }, { replace: true }); load(0); }, [kind, status]);
  const open = async (row: Row) => {
    try {
      const data = unwrap((await apiClient.get(`/manager/${kind}/${idOf(row, kind)}`)).data);
      setDetail(data);
    } catch (e: any) { setError(e.message || 'Could not load item'); }
  };
  const review = async (decision: 'approve' | 'reject') => {
    if (!detail) return;
    if (decision === 'reject' && reason.trim().length < 5) { setError('Please enter a reason of at least 5 characters.'); return; }
    setBusy(true); setError('');
    try {
      const id = idOf(detail, kind);
      const payload = decision === 'approve' ? { version: detail.version, note: '' } : { version: detail.version, reason: reason.trim() };
      unwrap((await apiClient.post(`/manager/${kind}/${id}/${decision}`, payload)).data);
      setRejecting(false); setReason(''); await load(Number(params.get('page') || 0));
    } catch (e: any) { setError(e.message || 'Review action failed. Reload the item and try again.'); }
    finally { setBusy(false); }
  };
  const page = Number(pageData.page || 0);
  const detailStatus = detail && statusOf(detail, kind);

  return <main className="space-y-5 p-8">
    <header><h1 className="text-xl font-bold text-content">Content review</h1><p className="mt-0.5 text-xs text-content-subtle">Review student submitted questions and course flashcard decks.</p></header>
    <div className="flex flex-wrap gap-2 border-b border-line">
      {(['contributions', 'decks'] as Kind[]).map((tab) => <button key={tab} onClick={() => setKind(tab)} className={`border-b-2 px-4 py-3 font-medium ${kind === tab ? 'border-brand-600 text-brand-700' : 'border-transparent text-content-secondary'}`}>{tab === 'contributions' ? 'Question contributions' : 'Flashcard decks'}</button>)}
    </div>
    {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>}
    <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(340px,0.8fr)]">
      <div className="overflow-hidden rounded-xl border border-line bg-surface">
        <div className="flex flex-wrap items-end gap-3 border-b border-line p-4">
          <label className="grid gap-1 text-sm">Status<select className="rounded-lg border border-line bg-surface px-3 py-2" value={status} onChange={e => setStatus(e.target.value)}>{['PENDING','APPROVED','REJECTED','ALL'].map(x => <option key={x}>{x}</option>)}</select></label>
          <label className="grid flex-1 gap-1 text-sm">Search<input className="rounded-lg border border-line bg-surface px-3 py-2" value={keyword} onChange={e => setKeyword(e.target.value)} onKeyDown={e => e.key === 'Enter' && load(0)} placeholder="Title or contributor" /></label>
          <Button variant="outline" onClick={() => load(0)} loading={busy}>Refresh</Button>
        </div>
        <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-surface-muted text-content-secondary"><tr>{['Item','Contributor','Submitted','Status'].map(x => <th key={x} className="px-4 py-3 font-medium">{x}</th>)}</tr></thead><tbody className="divide-y divide-line">{rows.map(row => <tr key={idOf(row, kind)} onClick={() => open(row)} className={`cursor-pointer hover:bg-surface-hover ${detail && idOf(detail, kind) === idOf(row, kind) ? 'bg-accent' : ''}`}><td className="max-w-xs px-4 py-3 font-medium text-content">{row.title || row.content || `#${idOf(row, kind)}`}<div className="truncate text-xs font-normal text-content-secondary">{row.course?.title || ''}{kind === 'decks' ? ` · ${row.cardCount ?? 0} cards` : ''}</div></td><td className="px-4 py-3">{row.owner?.fullName || row.contributor?.fullName || row.contributorName || '—'}</td><td className="whitespace-nowrap px-4 py-3">{row.submittedAt ? new Date(row.submittedAt).toLocaleString() : '—'}</td><td className="px-4 py-3">{statusOf(row, kind) || '—'}</td></tr>)}{!rows.length && <tr><td colSpan={4} className="p-8 text-center text-content-secondary">{busy ? 'Loading…' : 'No items found.'}</td></tr>}</tbody></table></div>
        <div className="flex items-center justify-between border-t border-line px-4 py-3 text-sm"><span>{pageData.totalElements || 0} items</span><div className="flex gap-2"><Button size="sm" variant="outline" disabled={page <= 0 || busy} onClick={() => { setParams({ kind, status, page: String(page - 1) }); load(page - 1); }}>Previous</Button><span className="px-2 py-1">{page + 1} / {Math.max(1, pageData.totalPages || 1)}</span><Button size="sm" variant="outline" disabled={page + 1 >= (pageData.totalPages || 1) || busy} onClick={() => { setParams({ kind, status, page: String(page + 1) }); load(page + 1); }}>Next</Button></div></div>
      </div>
      <article className="min-h-96 rounded-xl border border-line bg-surface p-5">
        {!detail ? <div className="grid h-full min-h-72 place-items-center text-center text-content-secondary">Select an item to inspect its content and review history.</div> : <>
          <div className="flex items-start justify-between gap-3"><div><div className="text-xs font-semibold uppercase tracking-wide text-content-secondary">{kind === 'decks' ? 'Flashcard deck' : 'Question contribution'} · {detailStatus}</div><h2 className="mt-1 text-xl font-bold">{detail.title || detail.content || `Item #${idOf(detail, kind)}`}</h2></div><span className="rounded-full bg-surface-muted px-3 py-1 text-xs">v{detail.version}</span></div>
          <div className="mt-4 space-y-3 text-sm"><p><b>Contributor:</b> {detail.owner?.fullName || detail.contributor?.fullName || detail.contributorName || '—'}</p><p><b>Course:</b> {detail.course?.title || '—'} {detail.module?.title ? `· ${detail.module.title}` : ''}</p>{detail.description && <p><b>Description:</b> {detail.description}</p>}
            {kind === 'decks' ? <div className="space-y-3">{(detail.cards?.content || []).map((card: Row) => <div key={card.cardId} className="rounded-lg border border-line p-3"><p className="font-medium">{card.frontText}</p><p className="mt-2 whitespace-pre-wrap text-content-secondary">{card.backText}</p>{card.codeBody && <pre className="mt-2 overflow-auto rounded bg-surface-muted p-2"><code>{card.codeBody}</code></pre>}</div>)}</div> : <><p className="whitespace-pre-wrap"><b>Content:</b> {detail.question?.content || detail.content || detail.questionText || '—'}</p>{detail.explanation && <p className="whitespace-pre-wrap"><b>Explanation:</b> {detail.explanation}</p>}{detail.duplicateCheck?.isDuplicate && <p className="rounded bg-amber-50 p-3 text-amber-900">Duplicate question detected. Existing question #{detail.duplicateCheck.existingQuestionId}; approval is disabled.</p>}</>}
            {!!detail.history?.length && <div><b>Review history</b>{detail.history.map((h: Row, i: number) => <p key={i} className="mt-1 text-content-secondary">{h.decision} · {h.note || h.reason || '—'} · {h.createdAt ? new Date(h.createdAt).toLocaleString() : ''}</p>)}</div>}
          </div>
          {detail.canReview && detailStatus === 'PENDING' && <div className="mt-6 flex flex-wrap gap-2 border-t border-line pt-4"><Button onClick={() => review('approve')} loading={busy} disabled={!!detail.duplicateCheck?.isDuplicate}>Approve</Button><Button variant="danger" onClick={() => setRejecting(true)} disabled={busy}>Reject</Button></div>}
          {!detail.canReview && <p className="mt-5 rounded-lg bg-surface-muted p-3 text-sm text-content-secondary">This item cannot be reviewed by your account.</p>}
          {rejecting && <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-4"><label className="grid gap-2 text-sm font-medium">Reason (5–1000 characters)<textarea autoFocus maxLength={1000} value={reason} onChange={e => setReason(e.target.value)} onKeyDown={e => e.key === 'Enter' && (e.ctrlKey || e.metaKey) && review('reject')} rows={4} className="rounded-lg border border-line bg-white p-3" placeholder="Explain why this submission is being rejected" /></label><div className="mt-3 flex justify-between text-xs text-content-secondary"><span>{reason.length}/1000</span><span>Ctrl+Enter to submit</span></div><div className="mt-3 flex gap-2"><Button variant="danger" onClick={() => review('reject')} loading={busy} disabled={reason.trim().length < 5}>Confirm rejection</Button><Button variant="outline" onClick={() => { setRejecting(false); setReason(''); }}>Cancel</Button></div></div>}
        </>}
      </article>
    </section>
  </main>;
}
