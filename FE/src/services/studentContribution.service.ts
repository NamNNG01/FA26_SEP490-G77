import { api } from './api';
import type { ApiResponse } from '@/auth/authContext';
import type { StudentPage } from './studentLearning.service';

export type ContributionType = 'question' | 'tip' | 'document';
export type ContributionStatus = 'PENDING' | 'ACCEPTED' | 'REJECTED';

export interface ContributionItem {
  contributionId: number;
  type: ContributionType;
  status: ContributionStatus;
  summary: string;
  createdAt: string;
  reviewedAt: string | null;
}

export interface ContributionOption {
  optionText: string;
  isCorrect: boolean;
}

export interface ContributionDetail extends ContributionItem {
  courseId?: number;
  categoryIds?: number[];
  difficulty?: 'EASY' | 'MEDIUM' | 'HARD';
  questionText?: string;
  options?: ContributionOption[];
  explanation?: string;
  sourceReference?: string | null;
  title?: string;
  content?: string;
  reviewNote?: string | null;
  resubmissionCount?: number;
}

export interface QuestionContributionBody {
  courseId: number;
  categoryIds: number[];
  difficulty: 'EASY' | 'MEDIUM' | 'HARD';
  questionText: string;
  options: ContributionOption[];
  explanation: string;
  sourceReference?: string | null;
}

function query(params: Record<string, string | number | undefined | null>) {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') qs.set(key, String(value));
  });
  return qs.toString();
}

export const studentContributionService = {
  async getMine(params: { type?: ContributionType; status?: ContributionStatus; page?: number; size?: number }) {
    const res = await api.get<ApiResponse<StudentPage<ContributionItem>>>(`/student/contributions?${query(params)}`);
    return res.data;
  },

  async getDetail(id: number | string) {
    const res = await api.get<ApiResponse<ContributionDetail>>(`/student/contributions/${id}`);
    return res.data;
  },

  async createQuestion(body: QuestionContributionBody) {
    const res = await api.post<ApiResponse<{ contributionId: number; status: ContributionStatus; createdAt: string }>>('/student/contributions', body);
    return res.data;
  },

  async createTip(body: { courseId: number; title: string; content: string; sourceReference?: string | null }) {
    const res = await api.post<ApiResponse<{ contributionId: number; status: ContributionStatus }>>('/student/tips/contributions', body);
    return res.data;
  },

  async resubmit(id: number | string, body: QuestionContributionBody) {
    const res = await api.request<ApiResponse<{ contributionId: number; status: ContributionStatus; resubmissionCount: number }>>({ method: 'put', url: `/student/contributions/${id}/resubmit`, data: body });
    return res.data;
  },
};
