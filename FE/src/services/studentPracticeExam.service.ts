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
  /** True while the check is mocked on the FE. */
  demo: boolean;
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

/** Stable shuffle, seeded by the question. */
function mockShuffle<T>(items: T[], seed: number): T[] {
  return items
    .map((item, i) => ({ item, k: seeded(seed * 17 + i) }))
    .sort((a, b) => a.k - b.k)
    .map(x => x.item);
}

/** Demo key of an ORDERING / MATCHING / FILL_BLANK question — fixed per questionId. */
function mockCorrectAnswer(q: AttemptQuestion, response: AnswerResponse | null): CorrectAnswer | null {
  switch (q.questionType) {
    case 'ORDERING':
      return { orderedOptionIds: mockShuffle((q.options ?? []).map(o => o.optionId), q.questionId) };
    case 'MATCHING': {
      const rights = mockShuffle(q.matching?.rights ?? [], q.questionId);
      if (rights.length === 0) return { pairs: [] };
      return { pairs: (q.matching?.lefts ?? []).map((left, i) => ({ left, right: rights[i % rights.length] })) };
    }
    case 'FILL_BLANK': {
      // No key on the FE: some blanks accept what was typed, the others a placeholder word.
      const blanks: Record<string, string[]> = {};
      for (const n of blankKeys(q)) {
        const typed = response?.blanks?.[n]?.trim();
        blanks[n] = [typed && seeded(q.questionId * 7 + Number(n)) < 0.6 ? typed : `answer ${n}`];
      }
      return { blanks };
    }
    default:
      return null;
  }
}

const MOCK_EXPLANATION = 'Demo explanation — the real explanation of this question shows here once the check API returns it.';

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
   * Instant check of one answer in a practice attempt (all six auto-graded types; the
   * response carries `correctAnswer` and `explanation` too). MOCK until the BE adds
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
    const isChoice = ['SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'TRUE_FALSE'].includes(question.questionType);
    const check: AnswerCheck = {
      supported: true,
      isCorrect: null,
      correctOptionIds: isChoice ? mockCorrectOptions(question) : [],
      correctAnswer: isChoice ? null : mockCorrectAnswer(question, response),
      explanation: MOCK_EXPLANATION,
      demo: true,
    };
    const parts = checkParts(question, response, check);
    const extraPicks = isChoice && (response?.selectedOptionIds ?? []).some(id => !check.correctOptionIds.includes(id));
    return { ...check, isCorrect: parts.correct === parts.total && !extraPicks };
  },
};
