import { api } from './api';
import type { ApiResponse } from '@/auth/authContext';
import type { PageResponse } from './course.service';
import type { AnswerResponse, AttemptQuestion, QuestionType } from './studentAttempt.service';

/**
 * Module Practice — a student practices the question bank of one module, one question at a time.
 * Every question can be answered again; the BE never sends the answer key, only the verdict.
 *   GET    /api/v1/student/modules/{moduleId}/practice/overview                               (MP-01)
 *   POST   /api/v1/student/modules/{moduleId}/practice/sessions                               (MP-02) — resumes the open one
 *   GET    /api/v1/student/practice/sessions/{sessionId}                                      (MP-03)
 *   GET    /api/v1/student/practice/sessions/{sessionId}/questions/{sessionQuestionId}         (MP-04)
 *   POST   /api/v1/student/practice/sessions/{sessionId}/questions/{sessionQuestionId}/answers (MP-05)
 *   GET    /api/v1/student/practice/sessions/{sessionId}/questions/{sessionQuestionId}/answers (MP-06)
 *   POST   /api/v1/student/practice/sessions/{sessionId}/complete                             (MP-07)
 *   GET    /api/v1/student/practice/sessions/{sessionId}/result                               (MP-08)
 *   POST   /api/v1/student/practice/questions/{questionId}/explanation                        (MP-09)
 *   GET    /api/v1/student/modules/{moduleId}/practice/review-questions                       (MP-11)
 *   DELETE /api/v1/student/modules/{moduleId}/practice/progress                               (MP-12)
 * MP-10 (bookmark) is the notebook's POST /api/v1/student/questions/{questionId}/bookmark.
 *
 * The course's General pool (questions of the exams not filed under any module) has the same four
 * scope endpoints under /api/v1/student/courses/{courseId}/general/practice/... (overview, sessions,
 * review-questions, progress); its sessions, results and review items carry `moduleId: null`.
 */

/**
 * ALL = the module's whole pool; REVIEW = only the questions still to review (latest attempt wrong,
 * or a rubric score under 0.50); BOOKMARKED = the bookmarked ones; TARGET = filtered by difficulty
 * and question type. The BE also takes WRONG (= REVIEW) and RANDOM (= ALL), which the FE does not offer.
 */
export type PracticeMode = 'ALL' | 'REVIEW' | 'WRONG' | 'BOOKMARKED' | 'RANDOM' | 'TARGET';
export type PracticeDifficulty = 'EASY' | 'MEDIUM' | 'HARD';

export const PRACTICE_MODE_LABEL: Record<PracticeMode, string> = {
  ALL: 'Practice',
  REVIEW: 'Review mistakes',
  WRONG: 'Review mistakes',
  BOOKMARKED: 'Bookmarked questions',
  RANDOM: 'Practice',
  TARGET: 'Targeted practice',
};
export type PracticeSessionStatus = 'IN_PROGRESS' | 'COMPLETED';
export type PracticeGradingStatus = 'UNANSWERED' | 'AUTO' | 'PENDING_AI' | 'QUEUED' | 'GRADING' | 'AI_GRADED' | 'FAILED';
export type MasteryStatus = 'NEW' | 'LEARNING' | 'MASTERED';
export type ExplanationSource = 'GENERATED' | 'CACHED' | 'MANAGER' | 'NOT_APPLICABLE' | 'FAILED' | 'QUOTA_EXCEEDED';

/** Session sizes offered; null = every eligible question of the module. */
export const PRACTICE_SIZES = [10, 20, 30, null] as const;
export const DEFAULT_PRACTICE_SIZE = 20;

/** The AI rubric worker is still on this attempt: ask again later. */
export const AWAITING_GRADE: ReadonlySet<string> = new Set(['PENDING_AI', 'QUEUED', 'GRADING']);

export interface ActivePracticeSession {
  sessionId: number;
  mode: PracticeMode;
  questionCount: number;
  answeredCount: number;
  correctCount: number;
  status: PracticeSessionStatus;
  startedAt: string;
  lastActivityAt: string | null;
  nextSessionQuestionId: number | null;
  nextQuestionOrderIndex: number | null;
}

/** What a practice covers: one module, or the General pool of a course. */
export type PracticeScope = { moduleId: number } | { courseId: number };

export interface ModulePracticeOverview {
  /** null = the course's General pool. */
  moduleId: number | null;
  moduleTitle: string;
  courseId: number;
  courseTitle: string;
  totalQuestions: number;
  practicedQuestions: number;
  unpracticedQuestions: number;
  everCorrectQuestions: number;
  totalAttempts: number;
  gradedAttempts: number;
  correctAttempts: number;
  wrongAttempts: number;
  /** correct / graded attempts, 0–1. */
  accuracyRate: number;
  questionsNeedingReview: number;
  activeSession: ActivePracticeSession | null;
}

export interface StartPracticeRequest {
  /** null = the whole module. */
  questionCount: number | null;
  mode: PracticeMode;
  /** TARGET only; none = any difficulty. */
  difficulty?: PracticeDifficulty | null;
  /** TARGET only; empty = any type. */
  questionTypes?: QuestionType[];
}

export interface SessionQuestionSummary {
  sessionQuestionId: number;
  questionId: number;
  orderIndex: number;
  questionType: QuestionType;
  answered: boolean;
  attemptCount: number;
  latestIsCorrect: boolean | null;
  latestScore: number | null;
  gradingStatus: PracticeGradingStatus;
}

export interface PracticeSession {
  sessionId: number;
  /** null = the course's General pool. */
  moduleId: number | null;
  moduleTitle: string;
  courseId: number;
  courseTitle: string;
  mode: PracticeMode;
  questionCount: number;
  answeredCount: number;
  correctCount: number;
  status: PracticeSessionStatus;
  startedAt: string;
  lastActivityAt: string | null;
  completedAt: string | null;
  durationSeconds: number;
  /** MP-02 returned the session already open instead of a new one. */
  resumed: boolean;
  nextSessionQuestionId: number | null;
  nextQuestionOrderIndex: number | null;
  questions: SessionQuestionSummary[];
}

export interface PracticeAttempt {
  practiceAnswerId: number;
  attemptNumber: number;
  response: AnswerResponse | null;
  isCorrect: boolean | null;
  scoreEarned: number | null;
  gradingStatus: PracticeGradingStatus;
  feedback: unknown;
  criteriaScores: unknown;
  timeSpentSeconds: number;
  answeredAt: string;
  gradedAt: string | null;
}

export interface PracticeQuestionView {
  sessionId: number;
  sessionQuestionId: number;
  questionId: number;
  orderIndex: number;
  questionsTotal: number;
  questionsAnswered: number;
  questionType: QuestionType;
  content: string;
  options: { optionId: number; optionText: string }[] | null;
  matching: { lefts: string[]; rights: string[] } | null;
  answerSpace: { maxLength: number | null } | null;
  media: { mediaId: number; optionId: number | null; mediaType: string; url: string; altText: string | null }[] | null;
  group: { groupId: number; questionType: string; title: string | null; passageText: string | null } | null;
  isBookmarked: boolean;
  attemptCount: number;
  latestIsCorrect: boolean | null;
  latestScore: number | null;
  gradingStatus: PracticeGradingStatus;
  attempts: PracticeAttempt[];
}

export interface SessionProgress {
  questionCount: number;
  answeredCount: number;
  correctCount: number;
  status: PracticeSessionStatus;
  nextSessionQuestionId: number | null;
  nextQuestionOrderIndex: number | null;
}

export interface AnswerSubmitted {
  sessionId: number;
  sessionQuestionId: number;
  questionId: number;
  practiceAnswerId: number;
  attemptNumber: number;
  isCorrect: boolean | null;
  scoreEarned: number | null;
  gradingStatus: PracticeGradingStatus;
  feedback: unknown;
  criteriaScores: unknown;
  answeredAt: string;
  gradedAt: string | null;
  /** The requestKey had already been answered: this is the stored attempt. */
  duplicate: boolean;
  session: SessionProgress;
}

export interface AnswerHistory {
  sessionId: number;
  sessionQuestionId: number;
  questionId: number;
  attemptCount: number;
  attempts: PracticeAttempt[];
}

export interface ResultQuestion {
  sessionQuestionId: number;
  questionId: number;
  orderIndex: number;
  questionType: QuestionType;
  attemptCount: number;
  latestIsCorrect: boolean | null;
  latestScore: number | null;
  gradingStatus: PracticeGradingStatus;
  firstAnsweredAt: string | null;
  lastAnsweredAt: string | null;
}

export interface PracticeResult {
  sessionId: number;
  moduleId: number | null;
  moduleTitle: string;
  status: PracticeSessionStatus;
  totalQuestions: number;
  answeredQuestions: number;
  unansweredQuestions: number;
  questionsLatestCorrect: number;
  questionsLatestWrong: number;
  questionsAwaitingGrade: number;
  /** Rubric questions (essay / diagram / code): a score but no right / wrong. */
  questionsGradedWithoutVerdict: number;
  questionsFailedGrade: number;
  totalAttempts: number;
  gradedAttempts: number;
  correctAttempts: number;
  wrongAttempts: number;
  accuracyRate: number;
  durationSeconds: number;
  startedAt: string;
  completedAt: string | null;
  questions: ResultQuestion[];
}

export interface ReviewItem {
  progressId: number;
  questionId: number;
  moduleId: number | null;
  questionType: QuestionType;
  content: string;
  totalAttempts: number;
  gradedAttempts: number;
  correctAttempts: number;
  wrongAttempts: number;
  lastIsCorrect: boolean | null;
  bestScore: number | null;
  masteryStatus: MasteryStatus;
  lastAnsweredAt: string | null;
}

export interface ResetResult {
  moduleId: number | null;
  deletedSessions: number;
  deletedProgressRecords: number;
}

export interface PracticeExplanation {
  questionId: number;
  sessionId: number;
  sessionQuestionId: number;
  practiceAnswerId: number | null;
  explanation: string | null;
  source: ExplanationSource;
  reason: string | null;
  quota: {
    freeLimit: number;
    freeUsed: number;
    freeReserved: number;
    freeRemaining: number;
    freeResetAt: string | null;
    planName: string | null;
    planRemaining: number;
    totalRemaining: number;
  } | null;
}

/** Practiced share of the module's questions, 0–100. */
export function practicePercent(o: Pick<ModulePracticeOverview, 'practicedQuestions' | 'totalQuestions'>): number {
  return o.totalQuestions > 0 ? Math.round((o.practicedQuestions / o.totalQuestions) * 100) : 0;
}

/** accuracyRate (0–1) as a whole percent. */
export function accuracyPercent(rate: number | null | undefined): number {
  return Math.round(Number(rate ?? 0) * 100);
}

/** MP-04 in the shape the shared answer inputs read. */
export function toAttemptQuestion(q: PracticeQuestionView): AttemptQuestion {
  return {
    questionId: q.questionId,
    orderIndex: q.orderIndex,
    questionType: q.questionType,
    content: q.content,
    options: q.options?.map(o => ({ ...o, isCorrectAnswer: null })) ?? null,
    matching: q.matching,
    maxPoints: null,
    answerSpace: q.answerSpace,
  };
}

const scopePath = (scope: PracticeScope) =>
  'moduleId' in scope ? `/student/modules/${scope.moduleId}/practice` : `/student/courses/${scope.courseId}/general/practice`;
const sessionPath = (sessionId: number | string) => `/student/practice/sessions/${sessionId}`;
const questionPath = (sessionId: number | string, sessionQuestionId: number | string) =>
  `${sessionPath(sessionId)}/questions/${sessionQuestionId}`;

export const modulePracticeService = {
  async getOverview(scope: PracticeScope): Promise<ModulePracticeOverview> {
    const res = await api.get<ApiResponse<ModulePracticeOverview>>(`${scopePath(scope)}/overview`);
    return res.data;
  },

  async startSession(scope: PracticeScope, body: StartPracticeRequest): Promise<PracticeSession> {
    const res = await api.post<ApiResponse<PracticeSession>>(`${scopePath(scope)}/sessions`, {
      mode: body.mode,
      ...(body.questionCount != null ? { questionCount: body.questionCount } : {}),
      ...(body.mode === 'TARGET' && body.difficulty ? { difficulty: body.difficulty } : {}),
      ...(body.mode === 'TARGET' && body.questionTypes?.length ? { questionTypes: body.questionTypes } : {}),
    });
    return res.data;
  },

  async getSession(sessionId: number | string): Promise<PracticeSession> {
    const res = await api.get<ApiResponse<PracticeSession>>(sessionPath(sessionId));
    return res.data;
  },

  async getQuestion(sessionId: number | string, sessionQuestionId: number | string): Promise<PracticeQuestionView> {
    const res = await api.get<ApiResponse<PracticeQuestionView>>(questionPath(sessionId, sessionQuestionId));
    return res.data;
  },

  async submitAnswer(
    sessionId: number | string,
    sessionQuestionId: number | string,
    body: { response: AnswerResponse; timeSpentSeconds?: number; requestKey?: string },
  ): Promise<AnswerSubmitted> {
    const res = await api.post<ApiResponse<AnswerSubmitted>>(`${questionPath(sessionId, sessionQuestionId)}/answers`, body);
    return res.data;
  },

  async getHistory(sessionId: number | string, sessionQuestionId: number | string): Promise<AnswerHistory> {
    const res = await api.get<ApiResponse<AnswerHistory>>(`${questionPath(sessionId, sessionQuestionId)}/answers`);
    return res.data;
  },

  async complete(sessionId: number | string): Promise<PracticeSession> {
    const res = await api.post<ApiResponse<PracticeSession>>(`${sessionPath(sessionId)}/complete`);
    return res.data;
  },

  async getResult(sessionId: number | string): Promise<PracticeResult> {
    const res = await api.get<ApiResponse<PracticeResult>>(`${sessionPath(sessionId)}/result`);
    return res.data;
  },

  /** No practiceAnswerId = the student's latest attempt of that session question. */
  async explain(
    questionId: number | string,
    body: { sessionId: number; sessionQuestionId: number; practiceAnswerId?: number | null },
  ): Promise<PracticeExplanation> {
    const res = await api.post<ApiResponse<PracticeExplanation>>(`/student/practice/questions/${questionId}/explanation`, {
      sessionId: body.sessionId,
      sessionQuestionId: body.sessionQuestionId,
      ...(body.practiceAnswerId != null ? { practiceAnswerId: body.practiceAnswerId } : {}),
    });
    return res.data;
  },

  async getReviewQuestions(scope: PracticeScope, page = 0, size = 20): Promise<PageResponse<ReviewItem>> {
    const res = await api.get<ApiResponse<PageResponse<ReviewItem>>>(
      `${scopePath(scope)}/review-questions?page=${page}&size=${size}`,
    );
    return res.data;
  },

  async resetProgress(scope: PracticeScope): Promise<ResetResult> {
    const res = await api.request<ApiResponse<ResetResult>>({ method: 'delete', url: `${scopePath(scope)}/progress` });
    return res.data;
  },
};
