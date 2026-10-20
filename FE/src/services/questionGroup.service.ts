import { api } from './api';
import type { ApiResponse } from '@/auth/authContext';

/**
 * QuestionGroupService — shared passages that several questions read from.
 *
 * Endpoints (QuestionGroupController):
 *   GET  /api/v1/manager/question-groups      (G-01)
 *   POST /api/v1/manager/question-groups      (G-02)
 *   PUT  /api/v1/manager/question-groups/{id} (G-03) — updateQuestionGroup
 */

/** QuestionGroupResponse */
export interface QuestionGroup {
  groupId: number;
  courseId: number | null;
  moduleId: number | null;
  title: string | null;
  passageText: string | null;
  questionCount: number;
}

export interface QuestionGroupCreateRequest {
  courseId: number;
  moduleId?: number | null;
  title?: string;
  passageText?: string;
}

/** QuestionGroupUpdateRequest */
export interface QuestionGroupUpdateRequest {
  title?: string;
  passageText?: string;
}

/** PageResponse<T> */
interface PageResponse<T> {
  content: T[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
}

export const questionGroupService = {
  async getQuestionGroups(params: { courseId?: number; moduleId?: number; search?: string; page?: number; size?: number } = {}): Promise<PageResponse<QuestionGroup>> {
    const query = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') query.set(key, String(value));
    });
    const qs = query.toString();
    const res = await api.get<ApiResponse<PageResponse<QuestionGroup>>>(`/manager/question-groups${qs ? `?${qs}` : ''}`);
    return res.data;
  },

  async createQuestionGroup(payload: QuestionGroupCreateRequest): Promise<QuestionGroup> {
    const res = await api.post<ApiResponse<QuestionGroup>>('/manager/question-groups', payload);
    return res.data;
  },

  /** G-03: omitted fields are kept; the change applies to every question in the group. */
  async updateQuestionGroup(groupId: number, payload: QuestionGroupUpdateRequest): Promise<QuestionGroup> {
    const res = await api.request<ApiResponse<QuestionGroup>>({ method: 'put', url: `/manager/question-groups/${groupId}`, data: payload });
    return res.data;
  },
};
