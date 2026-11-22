import { api } from './api';
import type { ApiResponse } from '@/auth/authContext';
import type { StudentPage } from './studentLearning.service';
import type { DiscussionDetail, DiscussionDetailComment, DiscussionItem, DiscussionTag } from './studentCommunity.service';

export type ManagerDiscussionStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'ALL';
export type ManagerPostStatus = 'OPEN' | 'CLOSED' | 'HIDDEN' | 'ALL';
export type AdminReportStatus = 'PENDING' | 'RESOLVED' | 'DISMISSED' | 'ALL';

export interface ModerationSummary {
  pendingDiscussionsCount: number;
  pendingReportsCount: number;
  rejectionTemplates: string[];
}

export interface DiscussionReportItem {
  reportId: number;
  targetType: 'DISCUSSION' | 'COMMENT';
  discussionId: number;
  discussionTitle: string;
  commentId: number | null;
  targetContent: string;
  targetAuthorId: number | null;
  targetAuthorName: string | null;
  reporterId: number;
  reporterName: string;
  reason: string;
  status: 'PENDING' | 'RESOLVED' | 'DISMISSED';
  resolutionNote: string | null;
  createdAt: string;
  resolvedAt: string | null;
}

function query(params: Record<string, string | number | boolean | undefined>) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== '') search.set(key, String(value));
  });
  return search.toString();
}

export const managerDiscussionService = {
  async list(params: {
    approvalStatus?: ManagerDiscussionStatus;
    status?: ManagerPostStatus;
    tag?: DiscussionTag | 'ALL';
    hasImage?: boolean;
    search?: string;
    sort?: 'oldest' | 'latest';
    page?: number;
    size?: number;
  } = {}) {
    const qs = query({
      ...params,
      tag: params.tag === 'ALL' ? undefined : params.tag,
    });
    const res = await api.get<ApiResponse<StudentPage<DiscussionItem>>>(`/admin/discussions${qs ? `?${qs}` : ''}`);
    return res.data;
  },
  async getSummary() {
    const res = await api.get<ApiResponse<ModerationSummary>>('/admin/discussions/summary');
    return res.data;
  },
  async getDetail(discussionId: number | string) {
    const res = await api.get<ApiResponse<DiscussionDetail>>(`/admin/discussions/${discussionId}`);
    return res.data;
  },
  async create(body: { title: string; content: string; tag: DiscussionTag; imageUrl?: string | null; isPinned: boolean }) {
    const res = await api.post<ApiResponse<DiscussionDetail>>('/admin/discussions', body);
    return res.data;
  },
  async approve(discussionId: number | string) {
    const res = await api.post<ApiResponse<DiscussionItem>>(`/admin/discussions/${discussionId}/approve`);
    return res.data;
  },
  async reject(discussionId: number | string, reason: string) {
    const res = await api.post<ApiResponse<DiscussionItem>>(`/admin/discussions/${discussionId}/reject`, { reason });
    return res.data;
  },
  async bulkApprove(discussionIds: number[]) {
    const res = await api.post<ApiResponse<{ updatedCount: number }>>('/admin/discussions/bulk-approve', { discussionIds });
    return res.data;
  },
  async bulkReject(discussionIds: number[], reason: string) {
    const res = await api.post<ApiResponse<{ updatedCount: number }>>('/admin/discussions/bulk-reject', { discussionIds, reason });
    return res.data;
  },
  async setPinned(discussionId: number | string, isPinned: boolean) {
    const res = await api.request<ApiResponse<DiscussionItem>>({ method: 'patch', url: `/admin/discussions/${discussionId}/pin`, data: { isPinned } });
    return res.data;
  },
  async hide(discussionId: number | string) {
    const res = await api.post<ApiResponse<DiscussionItem>>(`/admin/discussions/${discussionId}/hide`);
    return res.data;
  },
  async restore(discussionId: number | string) {
    const res = await api.post<ApiResponse<DiscussionItem>>(`/admin/discussions/${discussionId}/restore`);
    return res.data;
  },
  async setCommentStatus(commentId: number | string, status: 'VISIBLE' | 'HIDDEN', reason?: string) {
    const res = await api.request<ApiResponse<DiscussionDetailComment>>({ method: 'patch', url: `/admin/discussions/comments/${commentId}/status`, data: { status, reason } });
    return res.data;
  },
  async deleteComment(commentId: number | string) {
    await api.request<ApiResponse<null>>({ method: 'delete', url: `/admin/discussions/comments/${commentId}` });
  },
  async listReports(params: { status?: AdminReportStatus; page?: number; size?: number } = {}) {
    const qs = query(params);
    const res = await api.get<ApiResponse<StudentPage<DiscussionReportItem>>>(`/admin/discussions/reports${qs ? `?${qs}` : ''}`);
    return res.data;
  },
  async resolveReport(reportId: number, action: 'HIDE_AND_RESOLVE' | 'DISMISS', note?: string) {
    const res = await api.post<ApiResponse<DiscussionReportItem>>(`/admin/discussions/reports/${reportId}/resolve`, { action, note });
    return res.data;
  },
  async muteUser(targetUserId: number, days: number, reason: string) {
    await api.post<ApiResponse<null>>(`/admin/discussions/users/${targetUserId}/mute`, { days, reason });
  },
  async unmuteUser(targetUserId: number) {
    await api.post<ApiResponse<null>>(`/admin/discussions/users/${targetUserId}/unmute`);
  },
};
