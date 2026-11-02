import { api } from './api';
import type { ApiResponse } from '@/auth/authContext';

/**
 * Module Practice — a student practices the question bank of one module, one question at a time.
 *   GET  /api/v1/student/modules/{moduleId}/practice/overview   — counts, accuracy, session in progress
 *   POST /api/v1/student/modules/{moduleId}/practice/sessions   — starts a session (returns the one in progress if any)
 */

export type PracticeMode = 'ALL' | 'WRONG' | 'BOOKMARKED' | 'RANDOM' | 'TARGET';
export type PracticeSessionStatus = 'IN_PROGRESS' | 'COMPLETED';
export type PracticeDifficulty = 'EASY' | 'MEDIUM' | 'HARD';

/** Session sizes offered; null = every valid question of the module. */
export const PRACTICE_SIZES = [10, 20, 30, null] as const;
export const DEFAULT_PRACTICE_SIZE = 20;

export interface ActivePracticeSession {
  sessionId: number;
  questionCount: number;
  answeredCount: number;
  status: PracticeSessionStatus;
}

export interface ModulePracticeOverview {
  moduleId: number;
  moduleTitle: string;
  totalQuestions: number;
  practicedQuestions: number;
  unpracticedQuestions: number;
  questionsEverCorrect: number;
  totalAttempts: number;
  correctAttempts: number;
  wrongAttempts: number;
  accuracyRate: number;
  questionsNeedReview: number;
  activeSession: ActivePracticeSession | null;
}

export interface StartPracticeRequest {
  /** null = the whole module. */
  questionCount: number | null;
  mode: PracticeMode;
  /** TARGET only. */
  difficulty?: PracticeDifficulty;
  /** TARGET only; empty/absent = any type. */
  questionTypes?: string[];
}

export interface PracticeSession {
  sessionId: number;
  moduleId: number;
  questionCount: number;
  answeredCount: number;
  status: PracticeSessionStatus;
}

/** Practiced share of the module's questions, 0–100. */
export function practicePercent(o: Pick<ModulePracticeOverview, 'practicedQuestions' | 'totalQuestions'>): number {
  return o.totalQuestions > 0 ? Math.round((o.practicedQuestions / o.totalQuestions) * 100) : 0;
}

export const modulePracticeService = {
  async getOverview(moduleId: number | string): Promise<ModulePracticeOverview> {
    const res = await api.get<ApiResponse<ModulePracticeOverview>>(`/student/modules/${moduleId}/practice/overview`);
    return res.data;
  },

  async startSession(moduleId: number | string, body: StartPracticeRequest): Promise<PracticeSession> {
    const res = await api.post<ApiResponse<PracticeSession>>(`/student/modules/${moduleId}/practice/sessions`, body);
    return res.data;
  },
};
