import { api } from './api';
import { apiClient } from './axios';
import type { ApiResponse } from '@/auth/authContext';
import type { PageResponse } from './course.service';

/**
 * StudentAttemptService — exam detail and exam-taking for learners.
 *
 * Endpoints (StudentExamController, StudentAttemptController, StudentAiController):
 *   GET  /api/v1/student/exams/{examId}                      (EX-01) — detail + my stats + actions
 *   POST /api/v1/student/exams/{examId}/attempts             (SA-01) — start (409 if one is in progress)
 *   GET  /api/v1/student/attempts/{attemptId}                (SA-02) — reload paper + drafts
 *   PUT  /api/v1/student/attempts/{attemptId}/answers        (SA-03) — save drafts, ≤ 50 per call
 *   POST /api/v1/student/attempts/{attemptId}/submit         (SA-04)
 *   GET  /api/v1/student/attempts/{attemptId}/result         (SA-05)
 *   GET  /api/v1/student/exams/{examId}/attempts             (SA-06) — history, newest first
 *   POST /api/v1/student/attempts/{attemptId}/explanations:batch (SE-01) — AI explanations
 */

export type QuestionType =
  | 'SINGLE_CHOICE'
  | 'MULTIPLE_CHOICE'
  | 'TRUE_FALSE'
  | 'MATCHING'
  | 'FILL_BLANK'
  | 'ORDERING'
  | 'ESSAY'
  | 'CODE'
  | 'DIAGRAM';

/** Essay-like types are graded against a rubric (by the AI worker), not auto-graded. */
export const RUBRIC_TYPES: ReadonlySet<string> = new Set(['ESSAY', 'CODE', 'DIAGRAM']);

/**
 * `response` payload per question type (BE AnswerResponseValidator):
 *   SINGLE_CHOICE / TRUE_FALSE / MULTIPLE_CHOICE → { selectedOptionIds: number[] }
 *   MATCHING    → { matches: { left, right }[] }
 *   FILL_BLANK  → { blanks: { "1": "...", ... } }   — keys are the {{n}} placeholders
 *   ORDERING    → { orderedOptionIds: number[] }    — every option exactly once
 *   ESSAY / CODE → { text }
 *   DIAGRAM     → { drawioXml }
 */
export interface AnswerResponse {
  selectedOptionIds?: number[];
  matches?: { left: string; right: string }[];
  blanks?: Record<string, string>;
  orderedOptionIds?: number[];
  text?: string;
  drawioXml?: string;
}

export interface AttemptOption {
  optionId: number;
  optionText: string;
  /** Only filled on the result (SA-05); null while taking the exam. */
  isCorrectAnswer: boolean | null;
}

export interface AttemptQuestion {
  questionId: number;
  orderIndex: number;
  questionType: QuestionType;
  content: string;
  options: AttemptOption[] | null;
  matching: { lefts: string[]; rights: string[] } | null;
  maxPoints: number | null;
  answerSpace: { maxLength: number | null } | null;
}

/** SA-01 / SA-02 */
export interface AttemptSession {
  attemptId: number;
  examId: number;
  title: string;
  status: string;
  startTime: string;
  deadlineAt: string;
  serverTime: string;
  maxScore: number | null;
  questions: AttemptQuestion[];
  /** SA-02 only. */
  answers: { questionId: number; draftSeq: number | null; response: AnswerResponse | null }[] | null;
}

export interface DraftEntry {
  questionId: number;
  seq: number;
  response: AnswerResponse | null;
}

/** SA-03 */
export interface DraftSaved {
  saved: { questionId: number; draftSeq: number }[];
  rejected: { questionId: number; reason: string; detail: string }[];
  deadlineAt: string;
}

/** SA-04 */
export interface AttemptSubmitted {
  attemptId: number;
  status: string;
  totalScore: number | null;
  pendingPoints: number | null;
  maxScore: number | null;
  autoSubmitted: boolean;
  submittedAt: string;
}

export interface ResultCriterion {
  criterionId: string;
  name: string;
  maxPoints: number | null;
  points: number | null;
  feedback: string | null;
}

export interface ResultQuestion {
  questionId: number;
  orderIndex: number;
  questionType: QuestionType;
  content: string;
  options: AttemptOption[] | null;
  yourResponse: AnswerResponse | null;
  isCorrect: boolean | null;
  maxPoints: number | null;
  scoreEarned: number | null;
  weight: number | null;
  /** AUTO, PENDING_AI, AI_GRADED, … */
  gradingStatus: string | null;
  gradingError: string | null;
  criteria: ResultCriterion[] | null;
  overallFeedback: string | null;
  explanation: { text: string; source: string | null } | null;
  /**
   * Key of ORDERING / MATCHING / FILL_BLANK (their options carry no
   * `isCorrectAnswer`). FILL_BLANK `blanks`: placeholder number → accepted spellings.
   */
  correctAnswer?: {
    orderedOptionIds?: number[] | null;
    pairs?: { left: string; right: string }[] | null;
    blanks?: Record<string, string[]> | null;
  } | null;
}

/** SA-05 */
export interface AttemptResult {
  attemptId: number;
  examTitle: string;
  status: string;
  totalScore: number | null;
  pendingPoints: number | null;
  maxScore: number | null;
  submittedAt: string | null;
  autoSubmitted: boolean | null;
  questions: ResultQuestion[];
}

/** SA-06 */
export interface AttemptHistoryItem {
  attemptId: number;
  status: string;
  totalScore: number | null;
  pendingPoints: number | null;
  maxScore: number | null;
  startTime: string;
  submittedAt: string | null;
  autoSubmitted: boolean | null;
}

/** EX-01 */
export interface StudentExamDetail {
  examId: number;
  courseId: number;
  courseTitle: string;
  title: string;
  description: string | null;
  durationMinutes: number | null;
  maxScore: number | null;
  questionCount: number;
  publishedAt: string | null;
  myStats: {
    attemptCount: number;
    bestScore: number | null;
    lastSubmittedAt: string | null;
    lastAttemptId: number | null;
  } | null;
  actions: {
    canStart: boolean;
    activeAttemptId: number | null;
    canViewHistory: boolean;
    reason: string | null;
  } | null;
}

/**
 * One question of the exam, as the student may see it before starting — no
 * correct answer, no key. Shape of the proposed EX-03 (not in the BE yet).
 */
export interface ExamQuestionPreview {
  questionId: number;
  orderIndex: number;
  questionType: QuestionType;
  content: string;
  maxPoints: number | null;
  options: { optionId: number; optionText: string }[] | null;
  matching: { lefts: string[]; rights: string[] } | null;
}

/** SE-01 */
export interface ExplanationBatch {
  items: { questionId: number; explanation: string | null; source: string | null; reason: string | null }[];
}

/** SQ-01 — AI token quota (free daily allowance + an active plan's balance). */
export interface AiQuota {
  timezone: string;
  free: { dailyLimit: number; usedToday: number; remaining: number; resetAt: string };
  plan: { planName: string; tokenLimit: number; tokenUsed: number; remaining: number; startDate: string; endDate: string } | null;
  expiredPlan: { planName: string; endDate: string } | null;
  reservedPending: number;
}

/** SA-03 / SA-04 accept at most this many answers per call. */
export const DRAFT_BATCH_LIMIT = 50;

type AxiosLikeError = { response?: { status?: number; data?: { data?: unknown } } };

export const studentAttemptService = {
  /** EX-01 */
  async getExamDetail(examId: number | string): Promise<StudentExamDetail> {
    const res = await api.get<ApiResponse<StudentExamDetail>>(`/student/exams/${examId}`);
    return res.data;
  },

  /**
   * EX-03 (proposed) — the questions of an exam without answers, for the
   * read-only detail page. MOCK until the BE adds
   * `GET /student/exams/{examId}/questions` (docs/notes/student-exam-question-preview-be-gap.md);
   * then replace the body with:
   *   const res = await api.get<ApiResponse<ExamQuestionPreview[]>>(`/student/exams/${examId}/questions`);
   *   return res.data;
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async getExamQuestions(examId: number | string, questionCount: number): Promise<ExamQuestionPreview[]> {
    const { mockExamQuestions } = await import('@/features/student/data/mockExamQuestions');
    return mockExamQuestions(questionCount);
  },

  /**
   * SA-01. When an attempt is already running the BE answers 409 with its id —
   * resume that one (SA-02) instead of failing, so "Start" is always safe.
   */
  async start(examId: number | string): Promise<AttemptSession> {
    try {
      // No Idempotency-Key: the BE CORS config does not allow that header yet,
      // and the 409 fallback below already makes a double start harmless.
      const res = await apiClient.post<ApiResponse<AttemptSession>>(`/student/exams/${examId}/attempts`);
      return res.data.data;
    } catch (err) {
      const e = err as AxiosLikeError;
      const active = e.response?.status === 409 ? (e.response.data?.data as { activeAttemptId?: number } | undefined) : undefined;
      if (active?.activeAttemptId) return studentAttemptService.get(active.activeAttemptId);
      throw err;
    }
  },

  /** SA-02 */
  async get(attemptId: number | string): Promise<AttemptSession> {
    const res = await api.get<ApiResponse<AttemptSession>>(`/student/attempts/${attemptId}`);
    return res.data;
  },

  /** SA-03 — callers chunk to DRAFT_BATCH_LIMIT. */
  async saveDrafts(attemptId: number | string, answers: DraftEntry[]): Promise<DraftSaved> {
    const res = await api.request<ApiResponse<DraftSaved>>({
      method: 'put',
      url: `/student/attempts/${attemptId}/answers`,
      data: { answers },
    });
    return res.data;
  },

  /** SA-04 — drafts are flushed through SA-03 first, so the body stays empty. */
  async submit(attemptId: number | string): Promise<AttemptSubmitted> {
    const res = await api.post<ApiResponse<AttemptSubmitted>>(`/student/attempts/${attemptId}/submit`, {});
    return res.data;
  },

  /**
   * Deletes an IN_PROGRESS attempt and its drafts — "Delete attempt" on the
   * take screen's exit dialog.
   * ponytail: proposed endpoint, not in the BE yet (docs/notes/student-delete-attempt-be-gap.md).
   */
  async deleteAttempt(attemptId: number | string): Promise<void> {
    await api.request<ApiResponse<null>>({ method: 'delete', url: `/student/attempts/${attemptId}` });
  },

  /** SA-05 */
  async getResult(attemptId: number | string): Promise<AttemptResult> {
    const res = await api.get<ApiResponse<AttemptResult>>(`/student/attempts/${attemptId}/result`);
    return res.data;
  },

  /** SA-06 */
  async getHistory(examId: number | string, page = 0, size = 20): Promise<PageResponse<AttemptHistoryItem>> {
    const res = await api.get<ApiResponse<PageResponse<AttemptHistoryItem>>>(
      `/student/exams/${examId}/attempts?page=${page}&size=${size}`,
    );
    return res.data;
  },

  /** SA-06, every page — newest first. */
  async getAllHistory(examId: number | string): Promise<AttemptHistoryItem[]> {
    const items: AttemptHistoryItem[] = [];
    for (let page = 0; ; page++) {
      const res = await studentAttemptService.getHistory(examId, page, 100);
      items.push(...res.content);
      if (res.last || res.content.length === 0) return items;
    }
  },

  /**
   * SE-02 — asks the AI to grade the essay / code / diagram answers of a
   * submitted attempt. The worker never picks up PENDING_AI answers on its
   * own, so the result page must call this. No ids = every answer still
   * PENDING_AI or FAILED. Errors: 402 QUOTA_EXCEEDED, 409 NOTHING_TO_GRADE.
   */
  async requestGrading(attemptId: number | string): Promise<void> {
    await api.post<ApiResponse<unknown>>(`/student/attempts/${attemptId}/grading`, {});
  },

  /** SE-01 — 1 to 20 question ids. */
  async explain(attemptId: number | string, questionIds: number[]): Promise<ExplanationBatch> {
    const res = await api.post<ApiResponse<ExplanationBatch>>(`/student/attempts/${attemptId}/explanations:batch`, {
      questionIds,
    });
    return res.data;
  },

  /** SQ-01 */
  async getAiQuota(): Promise<AiQuota> {
    const res = await api.get<ApiResponse<AiQuota>>('/student/me/ai-quota');
    return res.data;
  },
};
