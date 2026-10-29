import { api } from './api';
import { apiClient } from './axios';
import type { ApiResponse } from '@/auth/authContext';
import type { PageResponse } from './course.service';

/**
 * StudentMaterialService — Material to Quiz Creator (spec §13, StudentMaterialController).
 *
 *   POST /api/v1/student/materials                              (MQ-01) — multipart, 201
 *   GET  /api/v1/student/materials?courseId=&page=&size=        (MQ-02) — newest first
 *   POST /api/v1/student/materials/{documentId}/generate-quiz   (MQ-03) — 202, AI job
 *   GET  /api/v1/student/materials/quiz-jobs/{jobId}            (MQ-04) — poll (Retry-After: 2)
 *   POST /api/v1/student/materials/quiz-jobs/{jobId}/start      (MQ-05) — attempt, taken with SA-02..SA-05
 *   GET  /api/v1/student/materials/quiz-history?page=&size=     (MQ-06)
 *
 * Errors: MQ-01 400 UNSUPPORTED_FILE_TYPE / FILE_TOO_LARGE, 403 not enrolled;
 * MQ-03 409 DUPLICATE_REQUEST (a job of the material is still running), 429 QUOTA_EXCEEDED;
 * MQ-05 409 job not COMPLETED.
 */

export const MATERIAL_ACCEPT = '.pdf,.docx';
export const MATERIAL_MAX_BYTES = 20 * 1024 * 1024;
export const MATERIAL_QUESTIONS = { min: 5, max: 30, default: 10 };

export type MaterialDifficulty = 'EASY' | 'MEDIUM' | 'HARD';
export type MaterialJobStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';

/** MQ-01 */
export interface UploadedMaterial {
  documentId: number;
  fileName: string;
  pageCount: number | null;
  title: string;
}

export interface MaterialJobBrief {
  jobId: number;
  questionCount: number;
  status: MaterialJobStatus;
}

/** MQ-02 */
export interface MaterialItem {
  documentId: number;
  title: string;
  fileName: string;
  pageCount: number | null;
  uploadedAt: string;
  jobs: MaterialJobBrief[];
}

/** MQ-03 body */
export interface GenerateQuizRequest {
  questionCount: number;
  difficulty?: MaterialDifficulty;
  sourceLessonId?: number;
}

/** MQ-03 (202) */
export interface MaterialJobAccepted {
  jobId: number;
  status: MaterialJobStatus;
  questionCount: number;
}

/** MQ-04 */
export interface MaterialJobState {
  jobId: number;
  status: MaterialJobStatus;
  /** 0–100. */
  progress: number | null;
  questionCount: number;
  errorMessage: string | null;
  /** examId of the generated quiz — set once COMPLETED. */
  quizId: number | null;
}

/** MQ-05 */
export interface MaterialQuizStarted {
  attemptId: number;
}

/** MQ-06 */
export interface MaterialHistoryItem {
  jobId: number;
  documentId: number;
  documentTitle: string;
  questionCount: number;
  bestScore: number | null;
  attemptCount: number;
  createdAt: string;
  /** examId of the generated quiz — matches ME-01 rows with mode MATERIAL_QUIZ. */
  quizId: number | null;
}

/** Running jobs: MQ-03 refuses a second one for the same material. */
export const isJobRunning = (status: MaterialJobStatus) => status === 'PENDING' || status === 'PROCESSING';

export const materialService = {
  /** MQ-01 */
  async upload(file: File, courseId: number, title?: string): Promise<UploadedMaterial> {
    const form = new FormData();
    form.append('file', file);
    form.append('courseId', String(courseId));
    if (title?.trim()) form.append('title', title.trim());
    const res = await apiClient.post<ApiResponse<UploadedMaterial>>('/student/materials', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 120000,
    });
    return res.data.data;
  },

  /** MQ-02 */
  async list(courseId: number | null, page = 0, size = 10): Promise<PageResponse<MaterialItem>> {
    const qs = new URLSearchParams({ page: String(page), size: String(size) });
    if (courseId != null) qs.set('courseId', String(courseId));
    return api.get<ApiResponse<PageResponse<MaterialItem>>>(`/student/materials?${qs}`).then(r => r.data);
  },

  /** MQ-03 */
  async generateQuiz(documentId: number, body: GenerateQuizRequest): Promise<MaterialJobAccepted> {
    return api.post<ApiResponse<MaterialJobAccepted>>(`/student/materials/${documentId}/generate-quiz`, body).then(r => r.data);
  },

  /** MQ-04. `retryAfterMs` comes from the Retry-After header. */
  async getJob(jobId: number): Promise<{ job: MaterialJobState; retryAfterMs: number | null }> {
    const res = await apiClient.get<ApiResponse<MaterialJobState>>(`/student/materials/quiz-jobs/${jobId}`);
    const seconds = Number(res.headers['retry-after']);
    return { job: res.data.data, retryAfterMs: Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : null };
  },

  /** MQ-05 — the questions in the response are reloaded by the take-exam screen (SA-02). */
  async start(jobId: number): Promise<MaterialQuizStarted> {
    return api.post<ApiResponse<MaterialQuizStarted>>(`/student/materials/quiz-jobs/${jobId}/start`).then(r => r.data);
  },

  /** MQ-06 */
  async history(page = 0, size = 10): Promise<PageResponse<MaterialHistoryItem>> {
    return api.get<ApiResponse<PageResponse<MaterialHistoryItem>>>(`/student/materials/quiz-history?page=${page}&size=${size}`).then(r => r.data);
  },

  /** MQ-06, every page — Exam History merges it with ME-01. */
  async allHistory(): Promise<MaterialHistoryItem[]> {
    const items: MaterialHistoryItem[] = [];
    for (let page = 0; ; page++) {
      const res = await materialService.history(page, 100);
      items.push(...res.content);
      if (res.last || res.content.length === 0) return items;
    }
  },
};

/** HTTP status of a failed call; null when the request never got an answer. */
export function errorStatus(err: unknown): number | null {
  return (err as { response?: { status?: number } } | null)?.response?.status ?? null;
}
