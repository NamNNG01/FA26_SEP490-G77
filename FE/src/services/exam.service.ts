import { api } from './api';
import { apiClient } from './axios';
import type { ApiResponse } from '@/auth/authContext';
import type { PageResponse } from './course.service';
import type { QuestionCreateRequest } from './question.service';

export type ExamStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
export type ExamKind = 'QUIZ' | 'ESSAY' | 'CODE' | 'DIAGRAM' | 'MIXED';
export type GenerationType = 'STATIC' | 'RANDOM' | 'MIXED';
export type Difficulty = 'EASY' | 'MEDIUM' | 'HARD';

export interface ExamListItem {
  examId: number;
  title: string;
  description?: string;
  courseId: number;
  courseName: string;
  moduleId?: number;
  moduleName?: string;
  examKind: ExamKind | null;
  durationMinutes: number;
  questionCount: number;
  maxScore?: number;
  totalWeight?: number;
  /** Legacy response field retained for older mock data. */
  totalPoints?: number;
  status: ExamStatus;
  generationType: GenerationType;
  isPractice: boolean;
  /** EXAM for normal course exams; CONTEST exams are only offered to contests and hidden from students' exam list. */
  mode?: ExamMode;
  createdAt: string;
}

export type ExamMode = 'EXAM' | 'CONTEST';

/** Manager's Mode picker: a course exam (EXAM) or a contest-only exam (CONTEST). Practice is a student's own mode. */
export const EXAM_MODE_OPTIONS: { label: string; value: ExamMode }[] = [
  { label: 'Course', value: 'EXAM' },
  { label: 'Contest', value: 'CONTEST' },
];

export interface ExamConfig {
  configId?: number;
  questionType: string;
  numberOfQuestions: number;
  moduleId?: number;
  difficulty?: string;
  weightEach?: number;
}

export interface ExamQuestion {
  examQuestionId: number;
  questionId: number;
  content: string;
  questionType: string;
  weight?: number;
  /** Legacy mock compatibility; the API field is `weight`. */
  points?: number;
  groupId?: number | null;
  orderIndex: number;
  hasRubric?: boolean;
}

export interface ExamGroup {
  examGroupId: number;
  groupId: number;
  title: string;
  /** Legacy mock compatibility; backend group links do not have a group score. */
  points?: number;
  orderIndex: number;
  passageText?: string;
  questionCount?: number;
}

export interface ExamDetail {
  examId: number;
  title?: string;
  description?: string;
  courseId?: number;
  courseName?: string;
  moduleId?: number;
  moduleName?: string;
  examKind?: ExamKind | null;
  durationMinutes?: number;
  questionCount?: number;
  totalPoints?: number;
  maxScore?: number;
  totalWeight?: number;
  status?: ExamStatus;
  generationType?: GenerationType;
  isPractice?: boolean;
  mode?: ExamMode;
  createdAt?: string;
  configs: ExamConfig[];
  questions: ExamQuestion[];
  groups: ExamGroup[];
  warnings?: string[];
}

export interface CreateExamRequest {
  title: string;
  description?: string;
  courseId?: number;
  moduleId?: number;
  durationMinutes: number;
  mode?: ExamMode;
  generationType: GenerationType;
  maxScore: number;
  status?: ExamStatus;
  questionIds?: { questionId: number; weight: number; orderIndex: number }[];
  /** Import-preview drafts (Q-03 payload shape); the server creates or reuses them and attaches them with the exam. */
  importedQuestions?: { question: QuestionCreateRequest; weight: number }[];
  configs?: ExamConfig[];
  groupIds?: { groupId: number; questions: { questionId: number; weight: number }[]; orderIndex: number }[];
}

export interface UpdateExamRequest {
  title?: string;
  description?: string;
  courseId?: number;
  moduleId?: number;
  durationMinutes?: number;
  mode?: ExamMode;
  generationType?: GenerationType;
  maxScore?: number;
  configs?: ExamConfig[];
}

export interface ExamQuestionListParams {
  search?: string;
  courseId?: number;
  moduleId?: number;
  groupId?: number;
  groupType?: string;
  questionType?: string;
  questionTypes?: string[];
  difficulty?: Difficulty;
  status?: string;
  page?: number;
  size?: number;
}

export interface ExamListParams {
  search?: string;
  courseId?: number;
  moduleId?: number;
  status?: ExamStatus | string;
  examKind?: ExamKind | string;
  page?: number;
  size?: number;
}

export interface RubricCriterion {
  name: string;
  weight: number;
  /** Legacy rubric data may still include maxScore. */
  maxScore?: number;
  descriptors?: string;
}

export interface RubricData {
  criteria: RubricCriterion[];
  totalPoints?: number;
  notes?: string;
}

export interface BankQuestionItem {
  questionId: number;
  content: string;
  courseId?: number;
  courseName?: string;
  moduleId?: number;
  moduleName?: string;
  groupId?: number | null;
  questionType: string;
  difficulty: Difficulty;
  status: 'ACTIVE' | 'INACTIVE' | 'DRAFT';
  optionCount?: number;
  options?: { optionId?: number; optionText: string; isCorrect: boolean; orderIndex: number }[];
  explanation?: string;
  essayGradingRubric?: RubricData | null;
  updatedAt?: string;
}

export interface QuestionGroupItem {
  groupId: number;
  courseId?: number;
  moduleId?: number;
  questionType: ExamKind;
  title: string;
  passageText: string;
  questionCount: number;
}

export interface QuestionGroupListParams {
  courseId?: number;
  moduleId?: number;
  questionType?: ExamKind;
  search?: string;
  page?: number;
  size?: number;
}

export interface CreateQuestionGroupRequest {
  courseId: number;
  moduleId?: number;
  questionType: ExamKind;
  title: string;
  passageText: string;
}

export interface AiRubricCriterion {
  name: string;
  maxScore?: number;
  weight?: number;
  descriptors?: string;
}

/** Same shape Q-03 (questions/batch) accepts, so a draft saves as-is. */
export interface AiQuestionDraft {
  content: string;
  questionType: string;
  difficulty: Difficulty;
  defaultPoints?: number;
  options?: { optionText: string; isCorrect: boolean; orderIndex: number }[];
  answerKey?: {
    blanks?: { index: number; accepted: string[]; caseSensitive?: boolean }[];
    pairs?: { left: string; right: string }[];
  };
  explanation?: string;
  questionMetadata?: { skillTag?: string; drawioXml?: string };
  essayGradingRubric?: { criteria: AiRubricCriterion[]; totalPoints?: number; notes?: string };
  /** CODE only: saved with the question as Q-03 takes it. */
  codeConfig?: {
    allowedLanguages?: string[] | null;
    codeTemplate?: string | null;
    timeLimitMs?: number | null;
    memoryLimitKb?: number | null;
  } | null;
  testCases?: { inputData: string; expectedOutput: string; hidden?: boolean | null; orderIndex?: number | null }[] | null;
  /** DIAGRAM only: PlantUML behind questionMetadata.drawioXml, for previews. Q-03 doesn't take it. */
  plantUmlSource?: string;
  /** Local preview returned by draw.io while an AI draft is being edited. */
  diagramSvg?: string;
}

export interface AiGenerateRequest {
  courseId: number;
  moduleId?: number;
  title?: string;
  questionCount: number;
  difficultyDistribution: {
    EASY: number;
    MEDIUM: number;
    HARD: number;
  };
  questionTypes: {
    questionType: string;
    count: number;
  }[];
  durationMinutes?: number;
  language: string;
  /** Teacher's own instructions for the AI (focus, audience, style); max 2000 chars. */
  context?: string;
}

export interface AiExamDraftResponse {
  title: string;
  description: string;
  durationMinutes: number;
  questionCount: number;
  questions: AiQuestionDraft[];
  warnings?: string[];
}

export interface ImportExamResponse {
  imported: number;
  reused: number;
  skippedDuplicates: number;
  questionIds: number[];
}

export const examService = {
  async getExams(params?: ExamListParams): Promise<PageResponse<ExamListItem>> {
    const q = new URLSearchParams();
    if (params?.search) q.set('search', params.search);
    if (params?.courseId) q.set('courseId', String(params.courseId));
    if (params?.moduleId) q.set('moduleId', String(params.moduleId));
    if (params?.status && params.status !== 'all') q.set('status', params.status);
    if (params?.examKind && params.examKind !== 'all') q.set('examKind', params.examKind);
    if (params?.page !== undefined) q.set('page', String(params.page));
    if (params?.size !== undefined) q.set('size', String(params.size));

    const queryStr = q.toString();
    const res = await api.get<ApiResponse<PageResponse<ExamListItem>>>(
      `/manager/exams${queryStr ? `?${queryStr}` : ''}`
    );
    if (!res.data || !Array.isArray(res.data.content)) {
      throw new Error('The exam response is invalid.');
    }
    return res.data;
  },

  async getExamById(id: number): Promise<ExamDetail> {
    const res = await api.get<ApiResponse<ExamDetail>>(`/manager/exams/${id}`);
    if (!res.data?.examId) throw new Error('The exam response is invalid.');
    return res.data;
  },

  async createExam(payload: CreateExamRequest): Promise<ExamDetail> {
    const res = await api.post<ApiResponse<ExamDetail>>('/manager/exams', payload);
    return res.data;
  },

  async updateExam(id: number, payload: UpdateExamRequest): Promise<ExamDetail> {
    const res = await api.request<ApiResponse<ExamDetail>>({
      method: 'put',
      url: `/manager/exams/${id}`,
      data: payload,
    });
    return res.data;
  },

  async patchPublishExam(id: number, status: ExamStatus): Promise<{ examId: number; status: ExamStatus; warnings?: string[] }> {
    const res = await api.request<ApiResponse<{ examId: number; status: ExamStatus; warnings?: string[] }>>({
      method: 'patch',
      url: `/manager/exams/${id}/publish`,
      data: { status },
    });
    return res.data;
  },

  async deleteExam(id: number): Promise<void> {
    await api.request<ApiResponse<null>>({ method: 'delete', url: `/manager/exams/${id}` });
  },

  async addQuestionToExam(id: number, payload: { questionId: number; weight?: number }): Promise<ExamQuestion> {
    const res = await api.post<ApiResponse<ExamQuestion>>(`/manager/exams/${id}/questions`, payload);
    return res.data;
  },

  async updateQuestionWeight(id: number, examQuestionId: number, weight: number): Promise<ExamQuestion> {
    const res = await api.request<ApiResponse<ExamQuestion>>({
      method: 'put',
      url: `/manager/exams/${id}/questions/${examQuestionId}`,
      data: { weight },
    });
    return res.data;
  },

  async removeQuestionFromExam(id: number, examQuestionId: number): Promise<void> {
    await api.request<ApiResponse<null>>({ method: 'delete', url: `/manager/exams/${id}/questions/${examQuestionId}` });
  },

  /** Removes every question and group link of the exam in one call. */
  async removeAllQuestionsFromExam(id: number): Promise<void> {
    await api.request<ApiResponse<null>>({ method: 'delete', url: `/manager/exams/${id}/questions` });
  },

  async addGroupToExam(id: number, payload: { groupId: number; questions: { questionId: number; weight: number }[]; orderIndex?: number }): Promise<ExamGroup> {
    const res = await api.post<ApiResponse<ExamGroup>>(`/manager/exams/${id}/groups`, payload);
    return res.data;
  },

  async removeGroupFromExam(id: number, examGroupId: number): Promise<void> {
    await api.request<ApiResponse<null>>({ method: 'delete', url: `/manager/exams/${id}/groups/${examGroupId}` });
  },

  async getQuestions(params?: ExamQuestionListParams): Promise<PageResponse<BankQuestionItem>> {
    const q = new URLSearchParams();
    if (params?.search) q.set('search', params.search);
    if (params?.courseId) q.set('courseId', String(params.courseId));
    if (params?.moduleId) q.set('moduleId', String(params.moduleId));
    if (params?.groupId) q.set('groupId', String(params.groupId));
    if (params?.groupType) q.set('groupType', params.groupType);
    if (params?.questionType) q.set('questionType', params.questionType);
    params?.questionTypes?.forEach((type) => q.append('questionTypes', type));
    if (params?.difficulty) q.set('difficulty', params.difficulty);
    if (params?.status) q.set('status', params.status);
    if (params?.page !== undefined) q.set('page', String(params.page));
    if (params?.size !== undefined) q.set('size', String(params.size));

    const queryStr = q.toString();
    const res = await api.get<ApiResponse<PageResponse<BankQuestionItem>>>(
      `/manager/questions${queryStr ? `?${queryStr}` : ''}`
    );
    if (!res.data || !Array.isArray(res.data.content)) {
      throw new Error('The question response is invalid.');
    }
    return res.data;
  },

  async getQuestionById(id: number): Promise<BankQuestionItem> {
    const res = await api.get<ApiResponse<BankQuestionItem>>(`/manager/questions/${id}`);
    if (!res.data?.questionId) throw new Error('The question response is invalid.');
    return res.data;
  },

  async updateRubric(questionId: number, payload: RubricData): Promise<BankQuestionItem> {
    const res = await api.request<ApiResponse<BankQuestionItem>>({
      method: 'put',
      url: `/manager/questions/${questionId}/rubric`,
      data: payload,
    });
    return res.data;
  },

  async getQuestionGroups(params?: QuestionGroupListParams): Promise<PageResponse<QuestionGroupItem>> {
    const q = new URLSearchParams();
    if (params?.search) q.set('search', params.search);
    if (params?.courseId) q.set('courseId', String(params.courseId));
    if (params?.moduleId) q.set('moduleId', String(params.moduleId));
    if (params?.questionType) q.set('questionType', params.questionType);
    if (params?.page !== undefined) q.set('page', String(params.page));
    if (params?.size !== undefined) q.set('size', String(params.size));

    const queryStr = q.toString();
    const res = await api.get<ApiResponse<PageResponse<QuestionGroupItem>>>(
      `/manager/question-groups${queryStr ? `?${queryStr}` : ''}`
    );
    if (!res.data || !Array.isArray(res.data.content)) {
      throw new Error('The question group response is invalid.');
    }
    return res.data;
  },

  async createQuestionGroup(payload: CreateQuestionGroupRequest): Promise<QuestionGroupItem> {
    const res = await api.post<ApiResponse<QuestionGroupItem>>('/manager/question-groups', payload);
    if (!res.data) throw new Error('The question group response is invalid.');
    return res.data;
  },

  async importQuestions(id: number, formData: FormData): Promise<ImportExamResponse> {
    const res = await apiClient.post<ApiResponse<ImportExamResponse>>(`/manager/exams/${id}/import`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    if (res.data?.success === false) {
      throw new Error(res.data.message || 'Failed to import questions.');
    }
    return res.data.data;
  },

  async generateAiExam(payload: AiGenerateRequest, signal?: AbortSignal): Promise<AiExamDraftResponse> {
    const res = await apiClient.post<ApiResponse<AiExamDraftResponse>>('/manager/exams/ai/generate', payload, {
      timeout: 100000,
      signal,
    });
    return res.data.data;
  },

};

