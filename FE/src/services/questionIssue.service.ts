import { apiClient } from "./axios";

export const ISSUE_TYPES = [
  "WRONG_CONTENT",
  "WRONG_ANSWER",
  "WRONG_EXPLANATION",
  "AI_EXPLANATION_ERROR",
  "MISSING_MEDIA",
  "OTHER",
] as const;
export const ISSUE_STATUSES = [
  "PENDING",
  "IN_PROGRESS",
  "RESOLVED",
  "REJECTED",
  "DUPLICATE",
  "WITHDRAWN",
] as const;
export type IssueType = (typeof ISSUE_TYPES)[number];
export type IssueStatus = (typeof ISSUE_STATUSES)[number];

function unwrap<T>(response: any): T {
  const body = response?.data;
  if (body?.success === false) throw new Error(body.message || "Request failed.");
  return body?.data ?? body;
}

export const questionIssueService = {
  studentList: async (params: Record<string, string | number> = {}) =>
    unwrap<any>(await apiClient.get("/student/question-issues", { params })),
  studentDetail: async (id: string | number) =>
    unwrap<any>(await apiClient.get(`/student/question-issues/${id}`)),
  report: async (payload: {
    questionId: number;
    issueType: IssueType;
    description: string;
    attachmentUrl?: string;
    attemptId?: number;
    practiceSessionId?: number;
    source?: "NOTEBOOK" | "OTHER";
    suggestedOptionIds?: number[];
    suggestedAnswer?: string;
  }) => unwrap<any>(await apiClient.post("/student/question-issues", payload)),
  withdraw: async (id: string | number) =>
    unwrap<any>(await apiClient.delete(`/student/question-issues/${id}`)),
  managerList: async (params: Record<string, string | number> = {}) =>
    unwrap<any>(await apiClient.get("/manager/question-issues", { params })),
  managerDetail: async (id: string | number) =>
    unwrap<any>(await apiClient.get(`/manager/question-issues/${id}`)),
  assign: async (id: string | number, assignedTo: number | null) =>
    unwrap<any>(await apiClient.patch(`/manager/question-issues/${id}/assign`, { assignedTo })),
  status: async (id: string | number, status: IssueStatus, note = "") =>
    unwrap<any>(await apiClient.patch(`/manager/question-issues/${id}/status`, { status, note })),
  duplicate: async (id: string | number, duplicateOfIssueId: number, note: string) =>
    unwrap<any>(
      await apiClient.post(`/manager/question-issues/${id}/duplicate`, {
        duplicateOfIssueId,
        note,
      }),
    ),
  resolve: async (id: string | number, payload: any) =>
    unwrap<any>(await apiClient.post(`/manager/question-issues/${id}/resolve`, payload)),
  history: async (id: string | number) =>
    unwrap<any>(await apiClient.get(`/manager/question-issues/${id}/history`)),
  jobs: async (id: string | number) =>
    unwrap<any>(await apiClient.get(`/manager/question-issues/${id}/regrade-jobs`)),
  confirmRegrade: async (id: string | number, jobId: number, confirmed: boolean, reason: string) =>
    unwrap<any>(
      await apiClient.post(`/manager/question-issues/${id}/regrade/confirm`, {
        jobId,
        confirmed,
        reason,
      }),
    ),
  retryJob: async (jobId: number) =>
    unwrap<any>(await apiClient.post(`/manager/question-issues/regrade-jobs/${jobId}/retry`)),
};

export function issueLabel(value?: string) {
  return (value || "")
    .toLowerCase()
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
