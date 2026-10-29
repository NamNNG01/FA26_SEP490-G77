import { api } from './api';
import type { ApiResponse } from '@/auth/authContext';
import type { PageResponse } from './course.service';
import type { AnswerResponse, AttemptQuestion } from './studentAttempt.service';

/**
 * StudentPracticeExamService — custom practice exams (Deadline1 §18, PracticeExamController).
 * Unlike course exams they do not count towards course progress; they are taken with SA-01..SA-05.
 *
 *   POST   /api/v1/student/practice-exams                (PQ-01) — 201, random PUBLISHED questions of the course
 *   GET    /api/v1/student/practice-exams?page=&size=     (PQ-02)
 *   DELETE /api/v1/student/practice-exams/{practiceId}    (PQ-03) — attempts already taken are kept
 *
 * Errors of PQ-01: 400 out-of-range values, 403 not enrolled, 422 NOT_ENOUGH_QUESTIONS (data.available).
 * "Category" in these bodies is a module of the course.
 */

export const PRACTICE_QUESTIONS = { min: 5, max: 100, default: 20 };
export const PRACTICE_MINUTES = { min: 1, max: 180, default: 30 };

export type PracticeExamType = 'MIDTERM' | 'FINAL';
export type PracticeDifficulty = 'EASY' | 'MEDIUM' | 'HARD';

export interface PracticeExamRequest {
  courseId: number;
  questionCount: number;
  durationMinutes: number;
  examType?: PracticeExamType;
  categoryIds?: number[];
  difficulty?: PracticeDifficulty;
}

/** PQ-01 */
export interface PracticeExamCreated {
  practiceId: number;
  title: string;
  questionCount: number;
  durationMinutes: number;
  examId: number;
}

/** PQ-02 */
export interface PracticeExamItem {
  practiceId: number;
  examId: number;
  title: string;
  questionCount: number | null;
  durationMinutes: number | null;
  bestScore: number | null;
  attemptCount: number | null;
  createdAt: string;
}

/** Result of "Check answer" on one question of a practice attempt. */
export interface AnswerCheck {
  /** False when the question type can't be checked before submitting. */
  supported: boolean;
  isCorrect: boolean | null;
  correctOptionIds: number[];
  /** True while the check is mocked on the FE. */
  demo: boolean;
}

/** Question types "Check answer" can grade (the others are shown after submitting). */
export const CHECKABLE_TYPES: ReadonlySet<string> = new Set(['SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'TRUE_FALSE']);

type ErrorBody = { message?: string; data?: { code?: string; available?: number } | null };

/** Readable PQ-01 error, with the bank size on NOT_ENOUGH_QUESTIONS. */
export function getPracticeError(error: unknown, fallback: string): string {
  const res = (error as { response?: { status?: number; data?: ErrorBody } } | null)?.response;
  if (!res) return fallback;
  const body = res.data;
  if (body?.data?.code === 'NOT_ENOUGH_QUESTIONS') {
    const available = body.data.available;
    return `The question bank does not have enough questions${available != null ? ` (only ${available} match)` : ''}. Lower the question count or remove some filters.`;
  }
  if (res.status === 403) return body?.message?.trim() || 'You are not enrolled in this course.';
  return body?.message?.trim() || fallback;
}

/** Stable pseudo-random 0..1 from a seed, so a question always gets the same demo key. */
function seeded(seed: number): number {
  const x = Math.sin(seed * 9301 + 49297) * 233280;
  return x - Math.floor(x);
}

/** Demo answer key of a choice question — fixed per questionId. */
function mockCorrectOptions(q: AttemptQuestion): number[] {
  const options = q.options ?? [];
  if (options.length === 0) return [];
  if (q.questionType === 'MULTIPLE_CHOICE') {
    const picked = options.filter((o, i) => seeded(q.questionId * 31 + i) < 0.45).map(o => o.optionId);
    return picked.length > 0 ? picked : [options[Math.floor(seeded(q.questionId) * options.length)].optionId];
  }
  return [options[Math.floor(seeded(q.questionId) * options.length)].optionId];
}

export const studentPracticeExamService = {
  /** PQ-01 */
  async create(body: PracticeExamRequest): Promise<PracticeExamCreated> {
    return api.post<ApiResponse<PracticeExamCreated>>('/student/practice-exams', body).then(r => r.data);
  },

  /** PQ-02 */
  async list(page = 0, size = 10): Promise<PageResponse<PracticeExamItem>> {
    return api.get<ApiResponse<PageResponse<PracticeExamItem>>>(`/student/practice-exams?page=${page}&size=${size}`).then(r => r.data);
  },

  /** PQ-03 */
  async remove(practiceId: number): Promise<void> {
    await api.request<ApiResponse<null>>({ method: 'delete', url: `/student/practice-exams/${practiceId}` });
  },

  /**
   * Instant check of one answer in a practice attempt. MOCK until the BE adds
   * `POST /student/attempts/{attemptId}/questions/{questionId}/check` for PRACTICE / SMART_PRACTICE
   * exams (docs/notes/student-practice-check-answer-be-gap.md); then replace the body with:
   *   const res = await api.post<ApiResponse<AnswerCheck>>(
   *     `/student/attempts/${attemptId}/questions/${question.questionId}/check`, { response });
   *   return res.data;
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async checkAnswer(attemptId: number, question: AttemptQuestion, response: AnswerResponse | null): Promise<AnswerCheck> {
    await new Promise(r => window.setTimeout(r, 250));
    if (!CHECKABLE_TYPES.has(question.questionType)) {
      return { supported: false, isCorrect: null, correctOptionIds: [], demo: true };
    }
    const correct = mockCorrectOptions(question);
    const given = response?.selectedOptionIds ?? [];
    const isCorrect = given.length === correct.length && given.every(id => correct.includes(id));
    return { supported: true, isCorrect, correctOptionIds: correct, demo: true };
  },
};
