import { apiClient } from './axios';
import type { ApiResponse } from '@/auth/authContext';

/**
 * StudentAiService — AI personalization (Deadline1 §25, StudentPersonalizationController).
 *
 *   POST /api/v1/student/ai/smart-practice           (AI-01) — 202, starts a job
 *   GET  /api/v1/student/ai/smart-practice/{jobId}   (AI-02) — poll, Retry-After while PROCESSING
 *   GET  /api/v1/student/ai/recommendations          (AI-03) — sync, cached 1h
 *   POST /api/v1/student/ai/weakness-report          (AI-04) — sync, cached 6h
 *
 * "Category" in these bodies is a module of the course (a course has one category; modules are its topics).
 * Errors: 403 not enrolled, 422 INSUFFICIENT_DATA, 429 QUOTA_EXCEEDED — read them with getAiError().
 * Calls use the raw client (not `api`) to read the Retry-After header and to raise the timeout.
 */

/** AI calls run up to the BE's 15 s AI timeout, so give them more room than the default client timeout. */
const AI_TIMEOUT_MS = 45000;

export const SMART_QUESTIONS = { min: 10, max: 30, default: 15 };
export const SMART_MINUTES = { min: 10, max: 60, default: 30 };

export type AiTrend = 'IMPROVING' | 'STABLE' | 'DECLINING';
export type AiPriority = 'HIGH' | 'MEDIUM' | 'LOW';
export type AiSource = 'GENERATED' | 'CACHED';

export interface AiQuotaLeft {
  freeRemaining: number;
  planRemaining: number;
  planEndDate: string | null;
}

// ------------------------------------------------------------- AI-01 / AI-02

export interface SmartPracticeRequest {
  courseId: number;
  questionCount?: number;
  durationMinutes?: number;
}

export interface CategoryAccuracy {
  categoryId: number;
  name: string;
  accuracy: number;
  questionCount: number;
}

export interface SmartPracticeStarted {
  jobId: string;
  status: SmartJobStatus;
  analysis: {
    totalAttempts: number;
    weakCategories: CategoryAccuracy[];
    strongCategories: CategoryAccuracy[];
  } | null;
}

export type SmartJobStatus = 'PROCESSING' | 'COMPLETED' | 'FAILED';

export interface SmartPracticeStatus {
  jobId: string;
  status: SmartJobStatus;
  examId: number | null;
  questionCount: number | null;
  focusAreas: string[] | null;
  estimatedDifficulty: string | null;
}

// ------------------------------------------------------------- AI-03

export type RecommendationType = 'FLASHCARD_DECK' | 'EXAM' | 'REVIEW_SESSION' | 'WEAK_TOPIC';

export interface Recommendation {
  type: RecommendationType;
  refId: number | null;
  title: string;
  reason: string;
  priority: AiPriority;
}

export interface Recommendations {
  generatedAt: string | null;
  source: AiSource;
  courseId: number;
  overallReadiness: number;
  strengths: { categoryId: number; name: string; accuracy: number; trend: AiTrend }[];
  weaknesses: { categoryId: number; name: string; accuracy: number; trend: AiTrend; priority: AiPriority }[];
  recommendations: Recommendation[];
  /** Set when there is too little data (recommendations is then empty). */
  message: string | null;
  quota: AiQuotaLeft | null;
}

// ------------------------------------------------------------- AI-04

export type WeaknessPeriod = 'LAST_7_DAYS' | 'LAST_30_DAYS' | 'ALL_TIME';

export const WEAKNESS_PERIOD_LABEL: Record<WeaknessPeriod, string> = {
  LAST_7_DAYS: 'Last 7 days',
  LAST_30_DAYS: 'Last 30 days',
  ALL_TIME: 'All time',
};

export interface CommonMistake {
  pattern: string;
  frequency: number;
  suggestion: string;
}

export interface CategoryBreakdown {
  categoryId: number;
  name: string;
  totalQuestions: number;
  correctCount: number;
  accuracy: number;
  trend: AiTrend;
  commonMistakes: CommonMistake[];
}

export interface WeaknessReport {
  generatedAt: string | null;
  source: AiSource;
  courseId: number;
  period: WeaknessPeriod;
  summary: string;
  categoryBreakdown: CategoryBreakdown[];
  questionTypeBreakdown: { questionType: string; accuracy: number; trend: AiTrend }[];
  actionPlan: string[];
  quota: AiQuotaLeft | null;
}

// ------------------------------------------------------------- errors

export type AiError =
  | { kind: 'QUOTA_EXCEEDED'; message: string; estimatedTokens: number | null; availableTokens: number | null }
  | { kind: 'INSUFFICIENT_DATA'; message: string }
  | { kind: 'OTHER'; message: string; status: number | null };

type ErrorBody = { message?: string; data?: { code?: string; estimatedTokens?: number; availableTokens?: number } | null };

/** Turns an AI call failure into what the screen shows (429 → quota numbers, 422 → "do more exams"). */
export function getAiError(error: unknown, fallback: string): AiError {
  const res = (error as { response?: { status?: number; data?: ErrorBody } } | null)?.response;
  const body = res?.data;
  const message = body?.message?.trim() || (error as { message?: string } | null)?.message || fallback;
  const code = body?.data?.code;
  if (res?.status === 429 || code === 'QUOTA_EXCEEDED') {
    return {
      kind: 'QUOTA_EXCEEDED',
      message,
      estimatedTokens: body?.data?.estimatedTokens ?? null,
      availableTokens: body?.data?.availableTokens ?? null,
    };
  }
  if (code === 'INSUFFICIENT_DATA') return { kind: 'INSUFFICIENT_DATA', message };
  return { kind: 'OTHER', message: res ? message : fallback, status: res?.status ?? null };
}

// ------------------------------------------------------------- calls

export const studentAiService = {
  async startSmartPractice(body: SmartPracticeRequest): Promise<SmartPracticeStarted> {
    const res = await apiClient.post<ApiResponse<SmartPracticeStarted>>('/student/ai/smart-practice', body, { timeout: AI_TIMEOUT_MS });
    return res.data.data;
  },

  /** AI-02. `retryAfterMs` comes from the Retry-After header (set only while PROCESSING). */
  async getSmartPractice(jobId: string): Promise<{ status: SmartPracticeStatus; retryAfterMs: number | null }> {
    const res = await apiClient.get<ApiResponse<SmartPracticeStatus>>(`/student/ai/smart-practice/${encodeURIComponent(jobId)}`);
    const seconds = Number(res.headers['retry-after']);
    return { status: res.data.data, retryAfterMs: Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : null };
  },

  async getRecommendations(courseId: number): Promise<Recommendations> {
    const res = await apiClient.get<ApiResponse<Recommendations>>(`/student/ai/recommendations?courseId=${courseId}`, {
      timeout: AI_TIMEOUT_MS,
    });
    return res.data.data;
  },

  async getWeaknessReport(courseId: number, period: WeaknessPeriod): Promise<WeaknessReport> {
    const res = await apiClient.post<ApiResponse<WeaknessReport>>(
      '/student/ai/weakness-report',
      { courseId, period },
      { timeout: AI_TIMEOUT_MS },
    );
    return res.data.data;
  },
};
