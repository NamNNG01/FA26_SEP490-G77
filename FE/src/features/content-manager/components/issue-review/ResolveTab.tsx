import { useId, useMemo } from 'react';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import { InsertImageButton, QuestionImagePreview, splitQuestionImage, withQuestionImage } from '@/components/common/QuestionContent';
import { QuestionForm } from '@/features/question/components/QuestionForm';
import { validateDraft, type QuestionDraft } from '@/features/question/model';
import { issueLabel } from '@/services/questionIssue.service';
import { RESOLUTION_OPTIONS, isTerminal, regradeNotice, resolutionOption, resolutionUnavailableReason, type ResolutionType } from './issueReviewModel';
import type { IssueReview } from './useIssueReview';

const fieldCls = 'w-full rounded-lg border border-line bg-surface p-3 text-sm text-content focus:outline-none focus:ring-2 focus:ring-brand-600/20 focus:border-brand-600';

function ContentEditor({ draft, onChange, showErrors }: { draft: QuestionDraft; onChange: (next: QuestionDraft) => void; showErrors: boolean }) {
  const id = useId();
  const { text, images } = splitQuestionImage(draft.content);
  const error = showErrors ? validateDraft(draft).content : undefined;
  const setContent = (content: string) => onChange({ ...draft, content });
  return <div>
    <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
      <label htmlFor={id} className="text-sm font-medium text-content-secondary">Corrected question text</label>
      <InsertImageButton value={draft.content} onChange={setContent} />
    </div>
    <textarea id={id} rows={6} value={text} aria-invalid={Boolean(error)} onChange={event => setContent(withQuestionImage(event.target.value, images[0]?.url ?? null))} className={`${fieldCls} ${error ? 'border-danger-solid' : ''}`} />
    <QuestionImagePreview value={draft.content} onChange={setContent} />
    {error && <p className="mt-1 text-xs text-danger">{error}</p>}
  </div>;
}

function ExplanationEditor({ draft, onChange }: { draft: QuestionDraft; onChange: (next: QuestionDraft) => void }) {
  const id = useId();
  return <label htmlFor={id} className="grid gap-1.5 text-sm font-medium text-content-secondary">
    Corrected explanation
    <textarea id={id} rows={6} value={draft.explanation} onChange={event => onChange({ ...draft, explanation: event.target.value })} className={fieldCls} placeholder="Why the answer is correct — shown to students during review." />
  </label>;
}

function CorrectionEditor({ review, type }: { review: IssueReview; type: ResolutionType }) {
  const { draft, setDraft, showErrors } = review;
  if (!draft) return null;
  switch (type) {
    case 'CONTENT_CORRECTED':
      return <ContentEditor draft={draft} onChange={setDraft} showErrors={showErrors} />;
    case 'EXPLANATION_CORRECTED':
      return <ExplanationEditor draft={draft} onChange={setDraft} />;
    case 'ANSWER_CORRECTED':
      if (draft.type === 'ESSAY') {
        return <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-warning-line bg-warning-light p-3 text-sm text-warning-strong">
          <p className="min-w-0 flex-1">Essay questions have no answer key. They are graded by a rubric, so corrections go through Grading rubric.</p>
          <Button size="sm" variant="outline" onClick={() => review.selectResolution('RUBRIC_CORRECTED')}>Edit the rubric</Button>
        </div>;
      }
      return <QuestionForm q={draft} index={0} heading="Answers" onChange={setDraft} showErrors={showErrors} allowedTypes={[draft.type]} sections={['answers']} />;
    case 'RUBRIC_CORRECTED':
      return <QuestionForm q={draft} index={0} heading="Grading rubric" onChange={setDraft} showErrors={showErrors} allowedTypes={[draft.type]} sections={['rubric']} />;
    case 'OTHER_CORRECTION':
      return <QuestionForm q={draft} index={0} heading="Full question editor" onChange={setDraft} showErrors={showErrors} allowedTypes={[draft.type]} />;
    case 'QUESTION_VOIDED':
      return <div className="rounded-lg border border-warning-line bg-warning-light p-3 text-sm text-warning-strong">
        <p className="font-medium">Voiding removes this question from scoring.</p>
        <p className="mt-1">The scoring version is updated and the question text, answers and rubric are left as they are. Add a note explaining why it is being voided.</p>
      </div>;
  }
}

/** Reports stay in view beside the editor on wide screens, so the manager can check the fix against them. */
function ReportReference({ reports }: { reports: any[] }) {
  if (!reports.length) return null;
  return <aside aria-label="Student reports for reference" className="hidden min-w-0 xl:block">
    <h3 className="text-sm font-semibold text-content">Reports for reference</h3>
    <ul className="mt-3 space-y-2">
      {reports.slice(0, 4).map(report => <li key={report.reportId} className="rounded-lg border border-line bg-surface-muted p-3 text-xs text-content-secondary">
        <p className="font-medium text-content">{report.student?.fullName || report.studentName || `Student #${report.userId ?? '—'}`}</p>
        <p className="mt-1 line-clamp-4 whitespace-pre-wrap break-words">{report.description}</p>
        {report.suggestedAnswer && <p className="mt-1">Suggested answer: {report.suggestedAnswer}</p>}
      </li>)}
    </ul>
    {reports.length > 4 && <p className="mt-2 text-xs text-content-subtle">{reports.length - 4} more on the Review tab.</p>}
  </aside>;
}

/** Rejecting or marking a duplicate closes the ticket without fixing the question, so they sit apart from the fix. */
function CloseWithoutFix({ review, onRequestReject, onRequestDuplicate }: { review: IssueReview; onRequestReject: () => void; onRequestDuplicate: () => void }) {
  const { busy } = review;
  const duplicateOptions = useMemo(() => [
    { label: 'Choose the primary ticket', value: '' },
    ...review.duplicateCandidates.map((candidate: any) => ({
      label: `Question #${candidate.questionId} · ${candidate.questionContent || 'Question content unavailable'}`,
      value: String(candidate.issueId),
    })),
  ], [review.duplicateCandidates]);

  return <details className="rounded-xl border border-line p-4">
    <summary className="cursor-pointer text-sm font-semibold text-content">Close without a fix</summary>
    <p className="mt-2 text-sm text-content-secondary">Use these when the question is fine or another ticket already covers it. The question is not changed.</p>
    <div className="mt-4 grid gap-5 lg:grid-cols-2">
      <div className="space-y-2">
        <h4 className="text-sm font-medium text-content">Reject this report</h4>
        <label className="grid gap-1.5 text-sm text-content-secondary">
          Rejection reason
          <textarea rows={3} className={fieldCls} value={review.rejectReason} onChange={event => review.setRejectReason(event.target.value)} placeholder="Explain why this report is rejected" />
        </label>
        <Button variant="danger" size="sm" disabled={busy || !review.rejectReason.trim()} onClick={onRequestReject}>Reject ticket</Button>
      </div>
      <div className="space-y-3">
        <h4 className="text-sm font-medium text-content">Mark as duplicate</h4>
        <SearchableSelect label="Primary ticket" options={duplicateOptions} value={review.duplicateId} onChange={review.setDuplicateId} placeholder="Choose a ticket" searchPlaceholder="Search tickets by question…" emptyText="No other tickets in this course" />
        <label className="grid gap-1.5 text-sm text-content-secondary">
          Reason
          <input value={review.duplicateNote} onChange={event => review.setDuplicateNote(event.target.value)} placeholder="Why is this a duplicate?" className="h-10 rounded-lg border border-line bg-surface px-3 text-sm text-content focus:outline-none focus:ring-2 focus:ring-brand-600/20 focus:border-brand-600" />
        </label>
        <Button variant="outline" size="sm" disabled={busy || !review.duplicateId || !review.duplicateNote.trim()} onClick={onRequestDuplicate}>Mark duplicate</Button>
      </div>
    </div>
  </details>;
}

export function ResolveTab({ review, onRequestTypeChange, onRequestReject, onRequestDuplicate }: {
  review: IssueReview;
  /** Called when the type changes; the modal confirms first if edits would be lost. */
  onRequestTypeChange: (type: ResolutionType) => void;
  onRequestReject: () => void;
  onRequestDuplicate: () => void;
}) {
  const { detail, draft, resolutionType } = review;
  const option = resolutionOption(resolutionType);
  const noteId = useId();
  const status = detail.status;
  const reports: any[] = detail.reports || [];

  if (status === 'PENDING') {
    return <div className="rounded-xl border border-line bg-surface-muted p-6 text-center">
      <h3 className="text-sm font-semibold text-content">Corrections unlock once the review starts</h3>
      <p className="mx-auto mt-1 max-w-md text-sm text-content-secondary">{review.assignedToMe ? 'Use Start review below to begin.' : 'Assign the ticket to yourself, then start the review.'}</p>
      <Button className="mt-4" variant="outline" size="sm" onClick={() => review.setTab('review')}>Back to the report</Button>
    </div>;
  }

  if (isTerminal(status)) {
    return <div className="rounded-xl border border-line bg-surface-muted p-6 text-center">
      <h3 className="text-sm font-semibold text-content">This ticket is {issueLabel(status).toLowerCase()}</h3>
      <p className="mx-auto mt-1 max-w-md text-sm text-content-secondary">It can no longer be edited. See the Insights and history tab for what happened.</p>
    </div>;
  }

  const notice = regradeNotice(resolutionType, detail.insights?.regradeImpact);

  return <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_18rem]">
    <div className="min-w-0 space-y-5">
      <fieldset>
        <legend className="text-sm font-semibold text-content">What needs to be corrected?</legend>
        <div className="mt-2 grid gap-2 sm:grid-cols-2 2xl:grid-cols-3">
          {RESOLUTION_OPTIONS.map(item => {
            const unavailable = resolutionUnavailableReason(item.value, draft);
            const checked = item.value === resolutionType;
            return <label key={item.value} className={`flex flex-col gap-0.5 rounded-[10px] border p-3 text-sm transition-colors focus-within:ring-2 focus-within:ring-brand-600/30 ${checked ? 'border-brand-600 bg-primary-light' : 'border-line bg-surface hover:bg-surface-hover'} ${unavailable ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}>
              <input type="radio" name="resolution-type" className="sr-only" checked={checked} disabled={!!unavailable || review.busy} onChange={() => onRequestTypeChange(item.value)} />
              <span className="font-medium text-content">{item.title}</span>
              <span className="text-xs text-content-secondary">{unavailable ?? item.summary}</span>
            </label>;
          })}
        </div>
      </fieldset>

      <section aria-labelledby="correction-editor" className="space-y-3 rounded-xl border border-line p-4">
        <div>
          <h3 id="correction-editor" className="text-sm font-semibold text-content">{option.editorTitle}</h3>
          <p className="mt-0.5 text-xs text-content-secondary">{option.scope}</p>
        </div>
        <CorrectionEditor review={review} type={resolutionType} />
        {notice && <Alert type={notice.tone} message={notice.text} />}
      </section>

      <div>
        <label htmlFor={noteId} className="mb-1.5 flex flex-wrap items-baseline gap-2 text-sm font-medium text-content-secondary">Resolution note <span className="text-xs font-normal text-content-subtle">Required</span></label>
        <textarea id={noteId} rows={3} value={review.resolutionNote} onChange={event => review.setResolutionNote(event.target.value)} className={fieldCls} placeholder="Explain what was corrected and why, for the students who reported it." />
      </div>

      <CloseWithoutFix review={review} onRequestReject={onRequestReject} onRequestDuplicate={onRequestDuplicate} />
    </div>
    <ReportReference reports={reports} />
  </div>;
}
