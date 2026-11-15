import { useCallback, useMemo, useRef, useState } from 'react';
import { fromDetail, type QuestionDraft } from '@/features/question/model';
import { useToast } from '@/components/ui/ToastHost';
import { questionIssueService } from '@/services/questionIssue.service';
import { getApiErrorMessage } from '@/utils/apiError';
import { buildResolution, toQuestionDetail, unwrapList, type ResolutionType, type ReviewTabId } from './issueReviewModel';

/**
 * State and requests for the ticket review modal. The list page only supplies the signed-in user and a
 * callback that reloads its queue after a ticket changes.
 */
export function useIssueReview({ userId, onChanged }: { userId?: number | string; onChanged: () => Promise<unknown> | void }) {
  const toast = useToast();
  const [row, setRow] = useState<any>(null);
  const [detail, setDetail] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [jobs, setJobs] = useState<any[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [duplicateCandidates, setDuplicateCandidates] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [tab, setTab] = useState<ReviewTabId>('review');

  const [startNote, setStartNote] = useState('');
  const [resolutionType, setResolutionType] = useState<ResolutionType>('CONTENT_CORRECTED');
  const [resolutionNote, setResolutionNote] = useState('');
  const [baseline, setBaseline] = useState<QuestionDraft | null>(null);
  const [draft, setDraft] = useState<QuestionDraft | null>(null);
  const [showErrors, setShowErrors] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [duplicateId, setDuplicateId] = useState('');
  const [duplicateNote, setDuplicateNote] = useState('');
  const [jobReasons, setJobReasons] = useState<Record<string, string>>({});

  // Only the newest request may write state: opening another ticket makes older responses stale.
  const requestVersion = useRef(0);
  const detailRef = useRef<any>(null);
  detailRef.current = detail;
  const onChangedRef = useRef(onChanged);
  onChangedRef.current = onChanged;

  const resetForms = useCallback((ticket: any) => {
    const fresh = fromDetail(toQuestionDetail(ticket));
    setBaseline(fresh);
    setDraft(fresh);
    setResolutionType('CONTENT_CORRECTED');
    setResolutionNote('');
    setShowErrors(false);
    setStartNote('');
    setRejectReason('');
    setDuplicateId('');
    setDuplicateNote('');
    setJobReasons({});
  }, []);

  /** `open` starts from a blank modal; `refresh` re-reads the ticket in place after an action. */
  const load = useCallback(async (issueId: number | string, mode: 'open' | 'refresh') => {
    const version = ++requestVersion.current;
    if (mode === 'open') {
      setDetail(null);
      setJobs([]);
      setHistory([]);
      setDuplicateCandidates([]);
      setNotice('');
      setTab('review');
      setLoading(true);
    }
    setError('');
    try {
      const ticket = await questionIssueService.managerDetail(issueId);
      if (version !== requestVersion.current) return;
      const previous = detailRef.current;
      setDetail(ticket);
      // Keep half-written edits across actions that do not change the ticket or the question.
      if (mode === 'open' || !previous || previous.status !== ticket.status || previous.question?.lockVersion !== ticket.question?.lockVersion) resetForms(ticket);
      const requests: Promise<any>[] = [questionIssueService.history(issueId), questionIssueService.jobs(issueId)];
      if (ticket.courseId) requests.push(questionIssueService.managerList({ status: 'ALL', courseId: ticket.courseId, page: 0, size: 100, sort: 'createdAt,desc' }));
      const [historyResult, jobsResult, candidatesResult] = await Promise.allSettled(requests);
      if (version !== requestVersion.current) return;
      if (historyResult.status === 'fulfilled') setHistory(unwrapList(historyResult.value));
      if (jobsResult.status === 'fulfilled') setJobs(unwrapList(jobsResult.value));
      if (candidatesResult?.status === 'fulfilled') {
        setDuplicateCandidates(unwrapList(candidatesResult.value).filter((candidate: any) => candidate.issueId !== ticket.issueId && !['DUPLICATE', 'WITHDRAWN'].includes(candidate.status)));
      }
    } catch (e) {
      if (version === requestVersion.current) setError(getApiErrorMessage(e, 'Could not load this ticket.'));
    } finally {
      if (version === requestVersion.current) setLoading(false);
    }
  }, [resetForms]);

  const open = useCallback(async (target: any) => {
    setRow(target);
    await load(target.issueId, 'open');
  }, [load]);

  const close = useCallback(() => {
    requestVersion.current += 1;
    setRow(null);
    setDetail(null);
    setLoading(false);
    setError('');
    setNotice('');
  }, []);

  /** Runs a request, re-reads the ticket, then lets the list page reload its queue. */
  const act = useCallback(async (action: (ticket: any) => Promise<unknown>, errorMessage: string, successMessage: string) => {
    const current = detailRef.current;
    if (!current) return false;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await action(current);
      await load(current.issueId, 'refresh');
      setNotice(successMessage);
      await onChangedRef.current();
      return true;
    } catch (e) {
      setError(getApiErrorMessage(e, errorMessage));
      return false;
    } finally {
      setBusy(false);
    }
  }, [load]);

  const assignedToMe = !!detail?.assignedTo && String(detail.assignedTo.userId) === String(userId);
  const isDirty = useMemo(() => !!draft && !!baseline && JSON.stringify(draft) !== JSON.stringify(baseline), [draft, baseline]);

  const assignToMe = useCallback(() => {
    if (userId == null) return Promise.resolve(false);
    return act(ticket => questionIssueService.assign(ticket.issueId, Number(userId)), 'Could not assign this ticket.', 'Ticket assigned to you.');
  }, [act, userId]);

  const startReview = useCallback(async () => {
    const ok = await act(ticket => questionIssueService.status(ticket.issueId, 'IN_PROGRESS', startNote.trim()), 'Could not start ticket review.', 'Review started. Choose what to correct, then save.');
    if (ok) setTab('resolve');
    return ok;
  }, [act, startNote]);

  const reject = useCallback(async () => {
    const ok = await act(ticket => questionIssueService.status(ticket.issueId, 'REJECTED', rejectReason.trim()), 'Could not reject this ticket.', 'Ticket rejected.');
    if (ok) toast.success('Ticket rejected.');
    return ok;
  }, [act, rejectReason, toast]);

  const markDuplicate = useCallback(() => act(ticket => questionIssueService.duplicate(ticket.issueId, Number(duplicateId), duplicateNote.trim()), 'Could not mark this ticket as a duplicate.', 'Ticket marked as a duplicate.'), [act, duplicateId, duplicateNote]);

  const confirmRegrade = useCallback((jobId: number) => act(ticket => questionIssueService.confirmRegrade(ticket.issueId, jobId, true, (jobReasons[String(jobId)] ?? '').trim()), 'Could not confirm regrade.', 'Regrade confirmed.'), [act, jobReasons]);

  const retryJob = useCallback((jobId: number) => act(() => questionIssueService.retryJob(jobId), 'Could not retry this job.', 'Regrade job restarted.'), [act]);

  /** Validates the selected correction; shows field errors and the request error when it fails. */
  const validateResolution = useCallback(() => {
    if (!detail || !draft) return false;
    const result = buildResolution(resolutionType, draft, detail.courseId ?? 0);
    if (result.ok) { setError(''); return true; }
    if (result.showFieldErrors) setShowErrors(true);
    setError(result.message);
    return false;
  }, [detail, draft, resolutionType]);

  const submitResolution = useCallback(async () => {
    if (!draft) return false;
    const result = buildResolution(resolutionType, draft, detail?.courseId ?? 0);
    if (!result.ok) return false;
    const ok = await act(ticket => questionIssueService.resolve(ticket.issueId, {
      resolutionType,
      resolutionNote: resolutionNote.trim(),
      expectedLockVersion: ticket.question?.lockVersion ?? ticket.questionLockVersion,
      changes: result.changes,
    }), 'Could not resolve this ticket.', 'Ticket resolved.');
    if (ok) toast.success('Ticket resolved.');
    return ok;
  }, [act, detail?.courseId, draft, resolutionNote, resolutionType, toast]);

  /** Switching the correction type; `discard` throws away edits made for the previous type. */
  const selectResolution = useCallback((type: ResolutionType, discard = false) => {
    if (discard) setDraft(baseline);
    setResolutionType(type);
    setShowErrors(false);
    setError('');
  }, [baseline]);

  return {
    row, detail, loading, jobs, history, duplicateCandidates, busy, error, notice, tab, setTab, setNotice,
    assignedToMe, isDirty,
    startNote, setStartNote,
    resolutionType, selectResolution, resolutionNote, setResolutionNote,
    draft, setDraft, showErrors,
    rejectReason, setRejectReason, duplicateId, setDuplicateId, duplicateNote, setDuplicateNote,
    jobReasons, setJobReason: (jobId: number | string, value: string) => setJobReasons(current => ({ ...current, [String(jobId)]: value })),
    open, close, assignToMe, startReview, reject, markDuplicate, confirmRegrade, retryJob, validateResolution, submitResolution,
  };
}

export type IssueReview = ReturnType<typeof useIssueReview>;
