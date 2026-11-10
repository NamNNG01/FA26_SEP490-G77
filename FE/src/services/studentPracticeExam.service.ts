import { api } from './api';
import type { ApiResponse } from '@/auth/authContext';
import type { PageResponse } from './course.service';
import type { AnswerResponse, AttemptQuestion, ResultQuestion } from './studentAttempt.service';

/**
 * StudentPracticeExamService — custom practice exams (Deadline1 §18, PracticeExamController).
 * Unlike course exams they do not count towards course progress; they are taken with SA-01..SA-05.
 *
 *   POST   /api/v1/student/practice-exams                (PQ-01) — 201, random PUBLISHED questions of the course
 *   GET    /api/v1/student/practice-exams?page=&size=     (PQ-02)
 *   DELETE /api/v1/student/practice-exams/{practiceId}    (PQ-03) — attempts already taken are kept
 *   GET    /api/v1/student/attempts/{attemptId}/wrong-questions (PQ-04) — wrong answers of a SUBMITTED /
 *          COMPLETED attempt as they were shown, without any key; 403 not mine, 409 ATTEMPT_NOT_SUBMITTED
 *
 * Errors of PQ-01: 400 out-of-range values, 403 not enrolled, 422 NOT_ENOUGH_QUESTIONS (data.available).
 * "Category" in these bodies is a module of the course.
 */

/** Only the maximum is enforced; BE still asks for 5 or more (see docs/notes). */
export const PRACTICE_QUESTIONS = { min: 1, max: 100, default: 20 };
export const PRACTICE_MINUTES = { min: 1, max: 180, default: 30 };

export type PracticeExamType = 'QUIZ' | 'ESSAY';
export type PracticeDifficulty = 'EASY' | 'MEDIUM' | 'HARD';

export interface PracticeExamRequest {
  courseId: number;
  questionCount: number;
  durationMinutes: number;
  examType?: PracticeExamType;
  categoryIds?: number[];
  /** How many questions to draw from each picked module; their sum equals questionCount. */
  moduleQuestionCounts?: { categoryId: number; questionCount: number }[];
  difficulty?: PracticeDifficulty;
  /** Name the student gives the practice exam; blank falls back to the BE default name. */
  title?: string;
  /** How it is taken: EXAM is saved as PRACTICE_EXAM, PRACTICE as PRACTICE (BE default EXAM). */
  mode?: 'EXAM' | 'PRACTICE';
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

/** Key of ORDERING / MATCHING / FILL_BLANK — same shape as SA-05 `ResultQuestion.correctAnswer`. */
export type CorrectAnswer = NonNullable<ResultQuestion['correctAnswer']>;

/** Result of "Check answer" on one question of a practice attempt. */
export interface AnswerCheck {
  /** False when the question type can't be checked before submitting. */
  supported: boolean;
  isCorrect: boolean | null;
  /** Correct options of a choice question (empty for the other types). */
  correctOptionIds: number[];
  correctAnswer?: CorrectAnswer | null;
  /** The question's explanation, if it has one. */
  explanation?: string | null;
}

/** Question types "Check answer" can grade (the others are shown after submitting). */
export const CHECKABLE_TYPES: ReadonlySet<string> = new Set([
  'SINGLE_CHOICE',
  'MULTIPLE_CHOICE',
  'TRUE_FALSE',
  'MATCHING',
  'ORDERING',
  'FILL_BLANK',
]);

/** Checked as soon as an option is picked: the answer is one choice. */
export const INSTANT_CHECK_TYPES: ReadonlySet<string> = new Set(['SINGLE_CHOICE', 'TRUE_FALSE']);

/** Fill-blank spellings are compared trimmed, with single spaces, ignoring case. */
export function normalizeBlank(text: string | null | undefined): string {
  return (text ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
}

/** Placeholder numbers of a fill-blank question (`{{n}}`); "1" when the text has none. */
export function blankKeys(question: AttemptQuestion): string[] {
  const keys = [...new Set([...question.content.matchAll(/\{\{(\d+)\}\}/g)].map(m => m[1]))];
  return keys.length > 0 ? keys : ['1'];
}

export type CheckOutcome = 'correct' | 'partial' | 'wrong';

/**
 * How many parts of a checked answer are right — options, pairs, positions or blanks —
 * so a question with several parts can say "3 / 4" instead of only right / wrong.
 */
export function checkParts(
  question: AttemptQuestion,
  response: AnswerResponse | null | undefined,
  check: AnswerCheck,
): { correct: number; total: number; outcome: CheckOutcome } {
  const key = check.correctAnswer;
  let correct = 0;
  let total = 1;
  switch (question.questionType) {
    case 'SINGLE_CHOICE':
    case 'TRUE_FALSE': {
      const picked = response?.selectedOptionIds ?? [];
      correct = picked.length === 1 && check.correctOptionIds.includes(picked[0]) ? 1 : 0;
      break;
    }
    case 'MULTIPLE_CHOICE': {
      // One part per correct option, plus one per wrong option picked.
      const keyIds = new Set(check.correctOptionIds);
      const picked = response?.selectedOptionIds ?? [];
      correct = picked.filter(id => keyIds.has(id)).length;
      total = keyIds.size + picked.filter(id => !keyIds.has(id)).length;
      break;
    }
    case 'MATCHING': {
      const given = new Map((response?.matches ?? []).map(m => [m.left, m.right]));
      const pairs = key?.pairs ?? [];
      correct = pairs.filter(p => given.get(p.left) === p.right).length;
      total = pairs.length;
      break;
    }
    case 'ORDERING': {
      const given = response?.orderedOptionIds ?? [];
      const order = key?.orderedOptionIds ?? [];
      correct = order.filter((id, i) => given[i] === id).length;
      total = order.length;
      break;
    }
    case 'FILL_BLANK': {
      const given = response?.blanks ?? {};
      const blanks = key?.blanks ?? {};
      const keys = Object.keys(blanks);
      correct = keys.filter(k => blanks[k].some(a => normalizeBlank(a) === normalizeBlank(given[k]))).length;
      total = keys.length;
      break;
    }
  }
  total = Math.max(total, 1);
  // The server verdict wins over the part count.
  if (check.isCorrect) return { correct: total, total, outcome: 'correct' };
  if (check.isCorrect === false) correct = Math.min(correct, total - 1);
  return { correct, total, outcome: correct === total ? 'correct' : correct > 0 ? 'partial' : 'wrong' };
}

/**
 * The check of a practice answer from the key sent with the paper (`AttemptQuestion.key`), so it shows
 * at once; SA-09 then stores, locks and confirms it. Null when the question has no key.
 */
export function checkFromKey(question: AttemptQuestion, response: AnswerResponse | null | undefined): AnswerCheck | null {
  const key = question.key;
  if (!key) return null;
  const check: AnswerCheck = {
    supported: true,
    isCorrect: null,
    correctOptionIds: key.correctOptionIds ?? [],
    correctAnswer: key.correctAnswer ?? null,
    explanation: key.explanation,
  };
  return { ...check, isCorrect: checkParts(question, response, check).outcome === 'correct' };
}

/** PQ-04 item: the question as the student saw it (no key, no answer). */
interface WrongQuestionItem {
  questionId: number;
  orderIndex: number | null;
  questionType: AttemptQuestion['questionType'];
  content: string | null;
  options?: { optionId: number; optionText: string }[] | null;
  matching?: AttemptQuestion['matching'];
  answerSpace?: AttemptQuestion['answerSpace'];
}

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

export const studentPracticeExamService = {
  /** PQ-01 */
  async create(body: PracticeExamRequest): Promise<PracticeExamCreated> {
    return api.post<ApiResponse<PracticeExamCreated>>('/student/practice-exams', body).then(r => r.data);
  },

  /** PQ-02 */
  async list(page = 0, size = 10): Promise<PageResponse<PracticeExamItem>> {
    return api.get<ApiResponse<PageResponse<PracticeExamItem>>>(`/student/practice-exams?page=${page}&size=${size}`).then(r => r.data);
  },

  /** PQ-02, every page — Exam History merges it with ME-01. */
  async listAll(): Promise<PracticeExamItem[]> {
    const items: PracticeExamItem[] = [];
    for (let page = 0; ; page++) {
      const res = await studentPracticeExamService.list(page, 100);
      items.push(...res.content);
      if (res.last || res.content.length === 0) return items;
    }
  },

  /** PQ-03 */
  async remove(practiceId: number): Promise<void> {
    await api.request<ApiResponse<null>>({ method: 'delete', url: `/student/practice-exams/${practiceId}` });
  },

  /** PQ-04, as answerable questions. */
  async getWrongQuestions(attemptId: number | string): Promise<AttemptQuestion[]> {
    const res = await api.get<ApiResponse<WrongQuestionItem[]>>(`/student/attempts/${attemptId}/wrong-questions`);
    return res.data.map(q => ({
      questionId: q.questionId,
      orderIndex: q.orderIndex ?? 0,
      questionType: q.questionType,
      content: q.content ?? '',
      options: q.options ? q.options.map(o => ({ optionId: o.optionId, optionText: o.optionText, isCorrectAnswer: null })) : null,
      matching: q.matching ?? null,
      maxPoints: null,
      answerSpace: q.answerSpace ?? null,
    }));
  },

  /**
   * SA-09 — checks one answer of a running practice attempt (PRACTICE, PRACTICE_EXAM, SMART_PRACTICE, MATERIAL_QUIZ):
   *   POST /student/attempts/{attemptId}/questions/{questionId}/check { response }
   * The BE stores and locks the answer and grades it with the same rule as submitting.
   * Rubric types come back `supported: false` (graded after submitting).
   */
  async checkAnswer(attemptId: number, question: AttemptQuestion, response: AnswerResponse | null): Promise<AnswerCheck> {
    const res = await api.post<ApiResponse<AnswerCheck>>(
      `/student/attempts/${attemptId}/questions/${question.questionId}/check`,
      { response },
    );
    return res.data;
  },
};
