import { useState } from 'react';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Progress } from '@/components/ui/Progress';
import { issueLabel } from '@/services/questionIssue.service';
import { JOB_NEEDS_ACTION } from './issueReviewModel';
import type { IssueReview } from './useIssueReview';

const HISTORY_SHOWN = 6;
const clampPct = (value?: number) => Math.min(100, Math.max(0, value ?? 0));

function Insights({ insights }: { insights: any }) {
  if (!insights) return <p className="text-sm text-content-secondary">No issue insights available.</p>;
  const reports = insights.reports;
  return <div className="space-y-5 text-sm">
    <div>
      <p className="font-medium text-content">Report breakdown</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {(reports?.byType || []).map((item: any) => <Badge key={`type-${item.key}`} variant="default" size="sm" className="font-normal">{issueLabel(item.key)} · {item.count}</Badge>)}
        {(reports?.bySource || []).map((item: any) => <Badge key={`source-${item.key}`} variant="default" size="sm" className="font-normal">{issueLabel(item.key)} · {item.count}</Badge>)}
        <Badge variant={reports?.outdatedReports ? 'warning' : 'default'} size="sm" className="font-normal">Older version · {reports?.outdatedReports ?? 0}</Badge>
      </div>
      {!!reports?.suggestedOptions?.length && <ul className="mt-3 space-y-2">
        {reports.suggestedOptions.map((option: any) => <li key={option.optionId} className="flex items-center justify-between gap-3 rounded-lg bg-surface-muted px-3 py-2 text-xs">
          <span>Suggested <b className="text-content">{option.optionText}</b>{option.isCorrectNow && <span className="ml-2 text-success">Current key</span>}</span>
          <Badge variant="default" size="sm">{option.count} report{option.count === 1 ? '' : 's'}</Badge>
        </li>)}
      </ul>}
      {!!reports?.suggestedAnswers?.length && <ul className="mt-2 space-y-2">
        {reports.suggestedAnswers.map((answer: string, index: number) => <li key={`${index}-${answer}`} className="rounded-lg bg-surface-muted px-3 py-2 text-xs leading-5 text-content-secondary">“{answer}”</li>)}
      </ul>}
    </div>

    {!!insights.answers?.optionPicks?.length && <div>
      <p className="font-medium text-content">Answer choices</p>
      <div className="mt-2 space-y-3">
        {insights.answers.optionPicks.map((option: any) => <div key={option.optionId}>
          <div className="mb-1 flex justify-between gap-2 text-xs">
            <span className="font-medium text-content">{option.optionText}{option.isCorrect ? ' · Current key' : ''}</span>
            <span className="text-content-secondary">{option.pickRate ?? 0}%</span>
          </div>
          <Progress value={clampPct(option.pickRate)} size="sm" color={option.isCorrect ? '#16a34a' : '#F27124'} />
        </div>)}
      </div>
    </div>}

    <div className="grid grid-cols-2 gap-3">
      {[['Exam correct', insights.answers?.examCorrectRate], ['Practice correct', insights.answers?.practiceCorrectRate]].map(([label, rate]: any) => <div key={label} className="rounded-xl border border-line bg-surface-muted p-3">
        <p className="text-xs text-content-secondary">{label}</p>
        <p className="mt-1 text-lg font-semibold text-content">{rate == null ? '—' : `${rate}%`}</p>
        {rate == null && <p className="text-xs text-content-subtle">No answers yet</p>}
      </div>)}
    </div>

    {!!insights.exams?.length && <div>
      <p className="font-medium text-content">Exams using this question</p>
      <ul className="mt-1 space-y-1 text-xs text-content-secondary">{insights.exams.map((exam: any) => <li key={exam.examId}>{exam.title} · {issueLabel(exam.status)} · {exam.attempts} attempts{exam.inPaper ? ' · fixed in paper' : ' · random pool'}</li>)}</ul>
    </div>}

    {insights.regradeImpact && <Alert type="warning" title="Regrade impact" message={insights.regradeImpact.answerCorrectionRegrades
      ? `Correcting the answer will regrade ${insights.regradeImpact.finishedAnswers} submitted answers; ${insights.regradeImpact.inProgressAnswers} active attempts will use the new key.`
      : `Answer correction will not regrade attempts; voiding this question can regrade ${insights.regradeImpact.finishedAnswers} submitted answers.`} />}

    {!!insights.relatedIssues?.length && <div>
      <p className="font-medium text-content">Related tickets</p>
      <ul className="mt-1 space-y-1 text-xs text-content-secondary">{insights.relatedIssues.map((issue: any) => <li key={issue.issueId}>#{issue.issueId} · {issueLabel(issue.issueType)} · {issueLabel(issue.status)} · {issue.reportCount} reports</li>)}</ul>
    </div>}
  </div>;
}

function JobCard({ job, review, onRequestConfirm }: { job: any; review: IssueReview; onRequestConfirm: (job: any) => void }) {
  const reason = review.jobReasons[String(job.jobId)] ?? '';
  const needsConfirmation = job.status === 'PENDING_CONFIRMATION';
  return <Card className={`p-3 text-xs ${JOB_NEEDS_ACTION.includes(job.status) ? '!border-warning-line' : ''}`}>
    <div className="flex justify-between gap-2"><b>Job #{job.jobId} · {issueLabel(job.status)}</b><span>{job.progressPercent ?? 0}%</span></div>
    <div className="mt-2"><Progress value={clampPct(job.progressPercent)} size="sm" /></div>
    <p className="mt-2 text-content-secondary">{job.processedAnswers ?? 0}/{job.totalAnswers ?? 0} processed · {job.failedAnswers ?? 0} failed</p>
    {needsConfirmation && <div className="mt-3 space-y-2">
      <p className="text-content-secondary">This regrade waits for you. Confirming recalculates the affected submitted answers.</p>
      <label className="grid gap-1 text-content-secondary">Confirmation reason
        <input className="rounded border border-line bg-surface px-2 py-1.5 text-content" value={reason} onChange={event => review.setJobReason(job.jobId, event.target.value)} />
      </label>
      <Button size="sm" disabled={!reason.trim() || review.busy} onClick={() => onRequestConfirm(job)}>Confirm regrade</Button>
    </div>}
    {['FAILED', 'PARTIAL_FAILED'].includes(job.status) && <Button className="mt-2" size="sm" variant="outline" loading={review.busy} onClick={() => void review.retryJob(job.jobId)}>Retry job</Button>}
  </Card>;
}

export function InsightsTab({ review, onRequestConfirmRegrade }: { review: IssueReview; onRequestConfirmRegrade: (job: any) => void }) {
  const { detail, jobs, history } = review;
  const [showAllHistory, setShowAllHistory] = useState(false);
  const entries = showAllHistory ? history : history.slice(0, HISTORY_SHOWN);

  return <div className="grid gap-6 xl:grid-cols-2">
    <section aria-labelledby="issue-insights" className="min-w-0 space-y-3">
      <div>
        <h3 id="issue-insights" className="text-sm font-semibold text-content">Report and answer insights</h3>
        <p className="mt-0.5 text-xs text-content-secondary">Patterns across reports and affected answers.</p>
      </div>
      <Insights insights={detail.insights} />
    </section>

    <div className="min-w-0 space-y-6">
      <section aria-labelledby="regrade-jobs" className="space-y-3">
        <h3 id="regrade-jobs" className="text-sm font-semibold text-content">Regrade jobs</h3>
        {jobs.map((job: any) => <JobCard key={job.jobId} job={job} review={review} onRequestConfirm={onRequestConfirmRegrade} />)}
        {!jobs.length && <p className="text-sm text-content-secondary">No regrade jobs.</p>}
      </section>

      <section aria-labelledby="ticket-history" className="space-y-3">
        <h3 id="ticket-history" className="text-sm font-semibold text-content">Ticket history</h3>
        <div className="space-y-3">
          {entries.map((entry: any, index: number) => <div key={entry.historyId ?? index} className="border-l-2 border-line pl-3 text-sm">
            <div className="flex flex-wrap justify-between gap-2"><b>{issueLabel(entry.action || entry.status)}</b><time className="text-xs text-content-subtle">{entry.createdAt ? new Date(entry.createdAt).toLocaleString() : ''}</time></div>
            {(entry.actor?.fullName || entry.note || entry.description) && <p className="mt-1 whitespace-pre-wrap break-words text-xs text-content-secondary">{entry.actor?.fullName ? `${entry.actor.fullName} · ` : ''}{entry.note || entry.description || ''}</p>}
          </div>)}
          {!history.length && <p className="text-sm text-content-secondary">No history entries.</p>}
        </div>
        {history.length > HISTORY_SHOWN && <Button size="sm" variant="outline" onClick={() => setShowAllHistory(current => !current)}>{showAllHistory ? 'Show fewer entries' : `Show all ${history.length} entries`}</Button>}
      </section>
    </div>
  </div>;
}
