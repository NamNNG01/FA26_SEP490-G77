import { api } from './api';
import type { ApiResponse } from '@/auth/authContext';
import type { StudentPage } from './studentLearning.service';

export type DiscussionTag = 'question' | 'tip';
export type DiscussionSort = 'latest' | 'mostCommented' | 'mostUpvoted';

export interface DiscussionAuthor {
  userId: number;
  displayName: string;
  avatarUrl: string | null;
  role: string;
}

export interface DiscussionComment {
  commentId: number;
  content: string;
  author: DiscussionAuthor;
  createdAt: string;
}

export interface DiscussionItem {
  discussionId: number;
  title: string;
  tag: DiscussionTag;
  excerpt: string;
  content?: string;
  author: DiscussionAuthor;
  upvoteCount: number;
  commentCount: number;
  isPinned: boolean;
  isUpvoted: boolean;
  isBookmarked?: boolean;
  isAuthor: boolean;
  isAnonymous?: boolean;
  isClosed?: boolean;
  createdAt: string;
  lastCommentAt: string | null;
  course?: { courseId: number; title: string };
  comments?: DiscussionComment[];
}

function query(params: Record<string, string | number | undefined | null>) {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') qs.set(key, String(value));
  });
  return qs.toString();
}

export const studentCommunityService = {
  async getDiscussions(params: { courseId?: number; tag?: DiscussionTag; search?: string; sort?: DiscussionSort; page?: number; size?: number }) {
    const res = await api.get<ApiResponse<StudentPage<DiscussionItem>>>(`/student/discussions?${query(params)}`);
    return res.data;
  },

  async getTips(params: { courseId?: number; page?: number; size?: number }) {
    const res = await api.get<ApiResponse<StudentPage<DiscussionItem>>>(`/student/tips?${query(params)}`);
    return res.data;
  },

  async getDiscussion(id: number | string) {
    const res = await api.get<ApiResponse<DiscussionItem>>(`/student/discussions/${id}`);
    return res.data;
  },

  async createDiscussion(body: { courseId: number; title: string; content: string; tag: DiscussionTag; isAnonymous: boolean }) {
    const res = await api.post<ApiResponse<DiscussionItem>>('/student/discussions', body);
    return res.data;
  },

  async addComment(id: number | string, body: { content: string; isAnonymous: boolean }) {
    const res = await api.post<ApiResponse<DiscussionComment>>(`/student/discussions/${id}/comments`, body);
    return res.data;
  },

  async toggleUpvote(id: number | string) {
    const res = await api.post<ApiResponse<{ discussionId: number; upvoteCount: number; isUpvoted: boolean }>>(`/student/discussions/${id}/upvote`);
    return res.data;
  },

  async toggleBookmark(id: number | string) {
    const res = await api.post<ApiResponse<{ discussionId: number; isBookmarked: boolean }>>(`/student/discussions/${id}/bookmark`);
    return res.data;
  },

  async setClosed(id: number | string, isClosed: boolean) {
    const res = await api.request<ApiResponse<{ discussionId: number; isClosed: boolean }>>({ method: 'patch', url: `/student/discussions/${id}`, data: { isClosed } });
    return res.data;
  },
};
