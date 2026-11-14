import { api } from './api';
import type { ApiResponse } from '@/auth/authContext';
import type { StudentPage } from './studentLearning.service';
import type { CodeQuestionConfig, CodeTestCaseDto } from './question.service';

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
  key?: string;
  optionText: string;
  isCorrect?: boolean | null;
  explanation?: string | null;
  orderIndex?: number;
}

export type ContributionQuestionType = 'SINGLE_CHOICE' | 'MULTIPLE_CHOICE' | 'TRUE_FALSE' | 'MATCHING' | 'FILL_BLANK' | 'ESSAY' | 'DIAGRAM' | 'DIAGRAM_ESSAY' | 'CODE' | 'ORDERING';

export interface ContributionDetail extends ContributionItem {
  courseId?: number;
  categoryIds?: number[];
  moduleId?: number | null;
  questionType?: ContributionQuestionType;
  difficulty?: 'EASY' | 'MEDIUM' | 'HARD';
  content?: string;
  questionText?: string;
  options?: ContributionOption[];
  answerKey?: unknown;
  questionMetadata?: Record<string, unknown> | null;
  essayGradingRubric?: unknown;
  codeConfig?: CodeQuestionConfig | null;
  testCases?: CodeTestCaseDto[] | null;
  explanation?: string;
  sourceReference?: string | null;
  title?: string;
  reviewNote?: string | null;
  resubmissionCount?: number;
}

export interface QuestionContributionBody {
  courseId: number;
  moduleId: number;
  questionType: ContributionQuestionType;
  difficulty: 'EASY' | 'MEDIUM' | 'HARD';
  content: string;
  options: ContributionOption[];
  answerKey?: unknown;
  correctOrder?: unknown[];
  questionMetadata?: Record<string, unknown> | null;
  essayGradingRubric?: unknown;
  codeConfig?: CodeQuestionConfig | null;
  testCases?: CodeTestCaseDto[] | null;
  explanation: string;
}

function query(params: Record<string, string | number | undefined | null>) {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') qs.set(key, String(value));
  });
  return qs.toString();
}

function normalizeContributionType(value: string): ContributionType {
  const normalized = value.toLowerCase();
  return normalized === 'tip' || normalized === 'document' ? normalized : 'question';
}

function normalizeContributionItem(item: ContributionItem): ContributionItem {
  return { ...item, type: normalizeContributionType(String(item.type ?? 'question')) };
}

export const studentContributionService = {
  async getMine(params: { type?: ContributionType; status?: ContributionStatus; page?: number; size?: number }) {
    const res = await api.get<ApiResponse<StudentPage<ContributionItem>>>(`/student/contributions?${query(params)}`);
    return { ...res.data, content: (res.data.content ?? []).map(normalizeContributionItem) };
  },

  async getAllMine(params: { type?: ContributionType; status?: ContributionStatus }) {
    const all: ContributionItem[] = [];
    for (let page = 0; ; page += 1) {
      const result = await studentContributionService.getMine({ ...params, page, size: 100 });
      all.push(...result.content);
      if (result.last || result.content.length === 0 || page + 1 >= result.totalPages) return all;
    }
  },

  async getDetail(id: number | string) {
    const res = await api.get<ApiResponse<ContributionDetail>>(`/student/contributions/${id}`);
    const detail = res.data;
    return {
      ...detail,
      ...normalizeContributionItem(detail),
      questionText: detail.questionText ?? detail.content,
    };
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
