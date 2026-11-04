import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { getApiErrorMessage } from '@/utils/apiError';
import { ISSUE_TYPES, issueLabel, questionIssueService, type IssueType } from '@/services/questionIssue.service';
import { Icon } from '@/assets/icons';

export function ReportQuestionIssueButton({ questionId, className = '' }: { questionId: number; className?: string }) {
  const [open, setOpen] = useState(false);
  return <><Button className={className} size="sm" variant="outline" icon={<Icon.Flag className="h-4 w-4" />} onClick={() => setOpen(true)}>Report issue</Button>{open && <ReportQuestionIssueDialog questionId={questionId} onClose={() => setOpen(false)} />}</>;
}

export function ReportQuestionIssueDialog({ questionId, onClose, onReported }: { questionId: number; onClose: () => void; onReported?: (result: any) => void }) {
  const [type, setType] = useState<IssueType>('WRONG_CONTENT');
  const [description, setDescription] = useState('');
  const [attachmentUrl, setAttachmentUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (description.trim().length < 10) { setError('Please describe the issue in at least 10 characters.'); return; }
    setBusy(true); setError('');
    try { const result = await questionIssueService.report({ questionId, issueType: type, description: description.trim(), ...(attachmentUrl.trim() ? { attachmentUrl: attachmentUrl.trim() } : {}) }); onReported?.(result); onClose(); }
    catch (err) { setError(getApiErrorMessage(err, 'Could not submit your report.')); }
    finally { setBusy(false); }
  }
  return <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" role="presentation" onMouseDown={e => e.target === e.currentTarget && !busy && onClose()}>
    <section role="dialog" aria-modal="true" aria-labelledby="report-issue-title" className="w-full max-w-lg rounded-2xl bg-surface p-6 shadow-xl">
      <div className="flex items-start justify-between gap-4"><div><h2 id="report-issue-title" className="text-lg font-bold text-content">Report a question issue</h2><p className="mt-1 text-sm text-content-secondary">Question #{questionId}. Your report will be visible to the course manager.</p></div><button type="button" className="text-content-secondary" onClick={onClose} aria-label="Close">✕</button></div>
      <form onSubmit={submit} className="mt-5 space-y-4">
        <label className="grid gap-1.5 text-sm font-medium">Issue type<select className="rounded-lg border border-line bg-surface px-3 py-2.5" value={type} onChange={e => setType(e.target.value as IssueType)}>{ISSUE_TYPES.map(x => <option key={x} value={x}>{issueLabel(x)}</option>)}</select></label>
        <label className="grid gap-1.5 text-sm font-medium">What seems wrong?<textarea required minLength={10} maxLength={3000} rows={5} value={description} onChange={e => setDescription(e.target.value)} placeholder="Tell us what you noticed and what you expected to see." className="resize-y rounded-lg border border-line bg-surface px-3 py-2.5 font-normal"/><span className="text-right text-xs font-normal text-content-secondary">{description.length}/3000</span></label>
        <label className="grid gap-1.5 text-sm font-medium">Attachment URL <span className="font-normal text-content-secondary">Optional image link</span><input type="url" value={attachmentUrl} onChange={e => setAttachmentUrl(e.target.value)} placeholder="https://…" className="rounded-lg border border-line bg-surface px-3 py-2.5 font-normal" /></label>
        {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
        <div className="flex justify-end gap-2 border-t border-line pt-4"><Button variant="outline" type="button" onClick={onClose} disabled={busy}>Cancel</Button><Button type="submit" loading={busy}>Send report</Button></div>
      </form>
    </section>
  </div>;
}
