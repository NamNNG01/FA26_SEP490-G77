import { useEffect, useSyncExternalStore } from 'react';
import { apiClient } from './axios';

export const ISSUE_TYPES = ['WRONG_CONTENT', 'WRONG_ANSWER', 'WRONG_EXPLANATION', 'AI_EXPLANATION_ERROR', 'MISSING_MEDIA', 'OTHER'] as const;
export const ISSUE_STATUSES = ['PENDING', 'IN_PROGRESS', 'RESOLVED', 'REJECTED', 'DUPLICATE', 'WITHDRAWN'] as const;
export type IssueType = typeof ISSUE_TYPES[number];
export type IssueStatus = typeof ISSUE_STATUSES[number];

function unwrap<T>(response: any): T {
  const body = response?.data;
  if (body?.success === false) throw new Error(body.message || 'Request failed.');
  return body?.data ?? body;
}

export const questionIssueService = {
  studentList: async (params: Record<string, string | number> = {}) => unwrap<any>((await apiClient.get('/student/question-issues', { params })).data),
  studentDetail: async (id: string | number) => unwrap<any>((await apiClient.get(`/student/question-issues/${id}`)).data),
  report: async (payload: { questionId: number; issueType: IssueType; description: string; attachmentUrl?: string; attemptId?: number; practiceSessionId?: number; source?: 'NOTEBOOK' | 'OTHER'; suggestedOptionIds?: number[]; suggestedAnswer?: string }) =>
    unwrap<any>((await apiClient.post('/student/question-issues', payload)).data),
  withdraw: async (id: string | number) => unwrap<any>((await apiClient.delete(`/student/question-issues/${id}`)).data),
  managerList: async (params: Record<string, string | number> = {}) => unwrap<any>((await apiClient.get('/manager/question-issues', { params })).data),
  managerDetail: async (id: string | number) => unwrap<any>((await apiClient.get(`/manager/question-issues/${id}`)).data),
  assign: async (id: string | number, assignedTo: number | null) => unwrap<any>((await apiClient.patch(`/manager/question-issues/${id}/assign`, { assignedTo })).data),
  status: async (id: string | number, status: IssueStatus, note = '') => unwrap<any>((await apiClient.patch(`/manager/question-issues/${id}/status`, { status, note })).data),
  duplicate: async (id: string | number, duplicateOfIssueId: number, note: string) => unwrap<any>((await apiClient.post(`/manager/question-issues/${id}/duplicate`, { duplicateOfIssueId, note })).data),
  resolve: async (id: string | number, payload: any) => unwrap<any>((await apiClient.post(`/manager/question-issues/${id}/resolve`, payload)).data),
  history: async (id: string | number) => unwrap<any>((await apiClient.get(`/manager/question-issues/${id}/history`)).data),
  jobs: async (id: string | number) => unwrap<any>((await apiClient.get(`/manager/question-issues/${id}/regrade-jobs`)).data),
  confirmRegrade: async (id: string | number, jobId: number, confirmed: boolean, reason: string) =>
    unwrap<any>((await apiClient.post(`/manager/question-issues/${id}/regrade/confirm`, { jobId, confirmed, reason })).data),
  retryJob: async (jobId: number) => unwrap<any>((await apiClient.post(`/manager/question-issues/regrade-jobs/${jobId}/retry`)).data),
};

/*
 * PENDING tickets for the manager sidebar badge. Polled every 30 s while the tab is visible;
 * the issues page calls refreshPendingIssueCount() after each reload so the badge follows its actions.
 */
let pendingCount = 0;
const pendingListeners = new Set<() => void>();

export function refreshPendingIssueCount(): void {
  questionIssueService
    .managerList({ status: 'PENDING', page: 0, size: 1 })
    .then(res => {
      const next = Number(res?.totalElements ?? 0);
      if (next !== pendingCount) { pendingCount = next; pendingListeners.forEach(l => l()); }
    })
    .catch(() => {}); // keep the last badge; the next tick retries
}

/** `enabled = false` for roles without the issue queue. */
export function usePendingIssueCount(enabled: boolean): number {
  const count = useSyncExternalStore(
    cb => { pendingListeners.add(cb); return () => { pendingListeners.delete(cb); }; },
    () => pendingCount,
  );
  useEffect(() => {
    if (!enabled) return;
    refreshPendingIssueCount();
    const tick = () => { if (document.visibilityState === 'visible') refreshPendingIssueCount(); };
    const timer = setInterval(tick, 30_000);
    document.addEventListener('visibilitychange', tick);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', tick); };
  }, [enabled]);
  return enabled ? count : 0;
}

export function issueLabel(value?: string) {
  return (value || '').toLowerCase().split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
}
