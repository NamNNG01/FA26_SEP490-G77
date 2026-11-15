import { api } from './api';
import type { ApiResponse } from '@/auth/authContext';
import type { StudentPage } from './studentLearning.service';
import type { DiscussionDetail, DiscussionDetailComment, DiscussionItem, DiscussionTag } from './studentCommunity.service';

export type ManagerDiscussionStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'ALL';
export type ManagerPostStatus = 'OPEN' | 'CLOSED' | 'HIDDEN' | 'ALL';

function query(params: Record<string, string | number | undefined>) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== '') search.set(key, String(value));
  });
  return search.toString();
}

export const managerDiscussionService = {
  async list(courseId: number | string, params: { approvalStatus?: ManagerDiscussionStatus; status?: ManagerPostStatus; search?: string; page?: number; size?: number } = {}) {
    const qs = query(params);
    const res = await api.get<ApiResponse<StudentPage<DiscussionItem>>>(`/manager/courses/${courseId}/discussions${qs ? `?${qs}` : ''}`);
    return res.data;
  },
  async getDetail(discussionId: number | string) {
    const res = await api.get<ApiResponse<DiscussionDetail>>(`/manager/discussions/${discussionId}`);
    return res.data;
  },
  async create(courseId: number | string, body: { title: string; content: string; tag: DiscussionTag; imageUrl?: string | null; isPinned: boolean }) {
    const res = await api.post<ApiResponse<DiscussionDetail>>(`/manager/courses/${courseId}/discussions`, body);
    return res.data;
  },
  async approve(discussionId: number | string) {
    const res = await api.post<ApiResponse<DiscussionItem>>(`/manager/discussions/${discussionId}/approve`);
    return res.data;
  },
  async reject(discussionId: number | string, reason: string) {
    const res = await api.post<ApiResponse<DiscussionItem>>(`/manager/discussions/${discussionId}/reject`, { reason });
    return res.data;
  },
  async setPinned(discussionId: number | string, isPinned: boolean) {
    const res = await api.request<ApiResponse<DiscussionItem>>({ method: 'patch', url: `/manager/discussions/${discussionId}/pin`, data: { isPinned } });
    return res.data;
  },
  async setClosed(discussionId: number | string, isClosed: boolean) {
    const res = await api.request<ApiResponse<DiscussionItem>>({ method: 'patch', url: `/manager/discussions/${discussionId}/close`, data: { isClosed } });
    return res.data;
  },
  async delete(discussionId: number | string) {
    await api.request<ApiResponse<null>>({ method: 'delete', url: `/manager/discussions/${discussionId}` });
  },
  async setCommentStatus(commentId: number | string, status: 'VISIBLE' | 'HIDDEN', reason?: string) {
    const res = await api.request<ApiResponse<DiscussionDetailComment>>({ method: 'patch', url: `/manager/discussions/comments/${commentId}/status`, data: { status, reason } });
    return res.data;
  },
  async deleteComment(commentId: number | string) {
    await api.request<ApiResponse<null>>({ method: 'delete', url: `/manager/discussions/comments/${commentId}` });
  },
};
