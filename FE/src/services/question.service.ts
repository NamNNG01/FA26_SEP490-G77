import { api } from './api';
import { apiClient } from './axios';
import { mockGenerateAiQuestions } from './mockQuestionAiData';
import type { ApiResponse } from '@/auth/authContext';

/**
 * QuestionService
 *
 * Types mirror the backend DTOs (com.examprep.dto.question.*) — do not
 * rename fields. Requests go through the shared axios instance, which
 * attaches the Bearer token.
 *
 * Endpoints (QuestionController):
 *   GET /api/v1/manager/questions  (Q-01: list with filters + pagination)
 */

/** Values accepted by the `questions.question_type` CHECK constraint. */
export type QuestionType =
  | 'SINGLE_CHOICE'
  | 'MULTIPLE_CHOICE'
  | 'TRUE_FALSE'
  | 'MATCHING'
  | 'FILL_BLANK'
  | 'ESSAY'
  | 'CODE'
  | 'DIAGRAM';

export type QuestionDifficulty = 'EASY' | 'MEDIUM' | 'HARD';

export type QuestionStatus = 'ACTIVE' | 'INACTIVE' | 'DRAFT';

/** UI names for the stored statuses: ACTIVE shows as Published, INACTIVE as Archived. */
export const QUESTION_STATUS_LABELS: Record<QuestionStatus, string> = {
  ACTIVE: 'Published',
  INACTIVE: 'Archived',
  DRAFT: 'Draft',
};

/** QuestionListItemDto */
export interface QuestionListItem {
  questionId: number;
  content: string;
  courseId: number | null;
  courseName: string | null;
  moduleId: number | null;
  moduleName: string | null;
  groupId: number | null;
  questionType: QuestionType | string;
  difficulty: QuestionDifficulty | string | null;
  status: QuestionStatus | string;
  approvalStatus: string;
  creatorRole: string;
  source: string;
  createdBy: number | null;
  scoringVersion: number | null;
  lockVersion: number | null;
  optionCount: number;
  updatedAt: string | null; // Instant → ISO string
}

export interface QuestionListParams {
  search?: string;
  courseId?: number;
  moduleId?: number;
  groupId?: number;
  questionType?: string;
  difficulty?: string;
  status?: string;
  page?: number;
  size?: number;
}

export interface QuestionPage {
  content: QuestionListItem[];
  /** Zero-based page index. */
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
}

/**
 * Spring serializes Page<T> either as PageImpl (totals at the top level) or,
 * with VIA_DTO serialization, with totals nested under `page`. Accept both.
 */
interface RawSpringPage<T> {
  content: T[];
  number?: number;
  size?: number;
  totalElements?: number;
  totalPages?: number;
  page?: { number: number; size: number; totalElements: number; totalPages: number };
}

function toQuestionPage(raw: RawSpringPage<QuestionListItem>): QuestionPage {
  const meta = raw.page ?? raw;
  return {
    content: raw.content ?? [],
    page: meta.number ?? 0,
    size: meta.size ?? raw.content?.length ?? 0,
    totalElements: meta.totalElements ?? raw.content?.length ?? 0,
    totalPages: meta.totalPages ?? 1,
  };
}

/** AnswerOptionDto */
export interface AnswerOption {
  optionId?: number | null;
  optionText: string;
  isCorrect: boolean;
  explanation?: string | null;
  orderIndex?: number;
}

/** answerKey for MATCHING (ScoringService reads `pairs`). */
export interface MatchingAnswerKey {
  pairs: { left: string; right: string }[];
}

/** answerKey for FILL_BLANK — `index` matches a {{n}} marker in the content. */
export interface FillBlankAnswerKey {
  blanks: { index: number; accepted: string[]; caseSensitive: boolean }[];
}

/** QuestionCreateRequest */
export interface QuestionCreateRequest {
  courseId: number;
  moduleId?: number | null;
  questionType: QuestionType;
  difficulty?: QuestionDifficulty;
  status?: QuestionStatus;
  content: string;
  options?: AnswerOption[];
  answerKey?: MatchingAnswerKey | FillBlankAnswerKey | null;
  groupId?: number | null;
  /** Stored as ai_explanation — shown to students during review. */
  explanation?: string | null;
  /** Free-form JSON; the editor keeps `title` and `skillTag` here. */
  questionMetadata?: Record<string, unknown> | null;
  essayGradingRubric?: unknown;
}

/** QuestionUpdateRequest — every field optional; `lockVersion` guards concurrent edits. */
export interface QuestionUpdateRequest extends Partial<Omit<QuestionCreateRequest, 'courseId'>> {
  lockVersion?: number | null;
}

/** QuestionDetailDto */
export interface QuestionDetail {
  questionId: number;
  courseId: number | null;
  moduleId: number | null;
  groupId: number | null;
  questionType: QuestionType;
  difficulty: QuestionDifficulty | null;
  content: string;
  questionMetadata: unknown;
  answerKey: unknown;
  defaultPoints: number | null;
  source: string;
  creatorRole: string;
  createdBy: number | null;
  scoringVersion: number | null;
  lockVersion: number | null;
  aiExplanation: string | null;
  status: QuestionStatus;
  approvalStatus: string;
  essayGradingRubric: unknown;
  options: AnswerOption[];
  createdAt: string | null;
  updatedAt: string | null;
}

/** AI-03 request: draft 1..10 questions of one type. Nothing is saved. */
export interface QuestionAiGenerateRequest {
  questionType: QuestionType;
  topic: string;
  count: number;
  difficulty?: QuestionDifficulty;
  courseId?: number | null;
  moduleId?: number | null;
  /** 2..6 — choice types only; the backend rejects it for others. */
  optionsCount?: number;
  language?: 'vi' | 'en';
}

/** One AI-03 preview question — same fields as a create request, minus the location. */
export interface QuestionAiDraft {
  content: string;
  questionType: QuestionType;
  difficulty: QuestionDifficulty | null;
  options: AnswerOption[];
  answerKey?: unknown;
  explanation?: string | null;
  questionMetadata?: Record<string, unknown> | null;
  essayGradingRubric?: unknown;
}

/** QuestionAiDraftResponse — invalid questions are dropped and reported in `warnings`. */
export interface QuestionAiDraftResponse {
  questions: QuestionAiDraft[];
  warnings: string[];
  /** FE only: the drafts are demo data from mockQuestionAiData, not the AI. */
  mock?: boolean;
}

/** `VITE_AI_MOCK=true` always uses demo data for AI-03 (no AI quota spent). */
const AI_MOCK = import.meta.env.VITE_AI_MOCK === 'true';

/** AI-03 statuses shown to the user instead of falling back to demo data. */
const REAL_AI_ERRORS = [403, 429, 502, 504];

export const questionService = {
  /** AI-03: preview only — accepted drafts are saved later through Q-02 / Q-03. */
  async generateAiQuestions(payload: QuestionAiGenerateRequest, signal?: AbortSignal): Promise<QuestionAiDraftResponse> {
    if (AI_MOCK) return { ...(await mockGenerateAiQuestions(payload, signal)), mock: true };
    try {
      // The backend gives the AI 20s; leave room for the round trip.
      const res = await apiClient.post<ApiResponse<QuestionAiDraftResponse>>('/manager/questions/ai/generate', payload, { timeout: 30000, signal });
      const data = res.data?.data;
      if (Array.isArray(data?.questions)) return { questions: data.questions, warnings: data.warnings ?? [] };
    } catch (err) {
      // Real AI outcomes (no permission, quota, upstream down/slow) and cancels surface as-is.
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (signal?.aborted || (status != null && REAL_AI_ERRORS.includes(status))) throw err;
    }
    // Backend doesn't serve the AI-03 contract yet — fall back to demo data.
    return { ...(await mockGenerateAiQuestions(payload, signal)), mock: true };
  },

  /** Q-03: creates 1..50 questions in one transaction — all or nothing. */
  async createQuestionsBatch(courseId: number, moduleId: number | null, questions: QuestionCreateRequest[]): Promise<QuestionDetail[]> {
    const query = new URLSearchParams({ courseId: String(courseId) });
    if (moduleId != null) query.set('moduleId', String(moduleId));
    const res = await api.post<ApiResponse<QuestionDetail[]>>(`/manager/questions/batch?${query}`, questions);
    return res.data;
  },

  /** Q-04 */
  async getQuestionById(id: number | string): Promise<QuestionDetail> {
    const res = await api.get<ApiResponse<QuestionDetail>>(`/manager/questions/${id}`);
    return res.data;
  },

  /** Q-05 */
  async updateQuestion(id: number | string, payload: QuestionUpdateRequest): Promise<QuestionDetail> {
    const res = await api.request<ApiResponse<QuestionDetail>>({ method: 'put', url: `/manager/questions/${id}`, data: payload });
    return res.data;
  },

  /** Q-06: soft delete. */
  async deleteQuestion(id: number | string): Promise<void> {
    await api.request<ApiResponse<void>>({ method: 'delete', url: `/manager/questions/${id}` });
  },

  /** Q-07: copies the question (options, answer key, group) and returns the new one. */
  async duplicateQuestion(id: number | string): Promise<QuestionDetail> {
    const res = await api.post<ApiResponse<QuestionDetail>>(`/manager/questions/${id}/duplicate`);
    return res.data;
  },

  /** Q-08 */
  async updateQuestionStatus(id: number | string, status: QuestionStatus, lockVersion?: number | null): Promise<QuestionDetail> {
    const res = await api.request<ApiResponse<QuestionDetail>>({
      method: 'patch',
      url: `/manager/questions/${id}/status`,
      data: { status, lockVersion },
    });
    return res.data;
  },

  async getQuestions(params: QuestionListParams = {}): Promise<QuestionPage> {
    const query = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value === undefined || value === null || value === '') return;
      query.set(key, String(value));
    });
    const queryString = query.toString();
    const res = await api.get<ApiResponse<RawSpringPage<QuestionListItem>>>(
      `/manager/questions${queryString ? `?${queryString}` : ''}`,
    );
    return toQuestionPage(res.data);
  },
};
