import { api } from './api';
import { apiClient } from './axios';
import type { ApiResponse } from '@/auth/authContext';

/**
 * AiFlashcardService — AI flashcard generation and the caller's AI token quota.
 *
 *   POST /api/v1/ai/flashcards/generate                    (API 31) — multipart, 202 + generationId
 *   GET  /api/v1/ai/flashcards/generations/{generationId}  (API 32) — poll every 2–3 s, ~90 s max
 *   GET  /api/v1/ai/usage/me                               (API 33)
 *
 * Generated cards are saved with API 30 (flashcardImportService.save, source = AI + aiGenerationId).
 *
 * Errors (`data.code`): AI_QUOTA_EXCEEDED 402, INPUT_REQUIRED / INPUT_CONFLICT 400, EMPTY_CONTENT /
 * CONTENT_TOO_LONG / PDF_NO_TEXT_LAYER 422, FILE_TOO_LARGE 413, UNSUPPORTED_FILE_TYPE 415, RATE_LIMITED 429.
 * A FAILED job carries errorCode AI_PROVIDER_ERROR | AI_INVALID_OUTPUT | AI_TIMEOUT.
 */

export const AI_TEXT_MAX = 20000;
export const AI_FILE_MAX_BYTES = 10 * 1024 * 1024;
export const AI_FILE_EXTENSIONS = ['pdf', 'docx', 'txt'];
export const AI_CARDS_MIN = 1;
export const AI_CARDS_MAX = 50;
export const AI_CARDS_DEFAULT = 20;
export const AI_FOCUS_TOPIC_MAX = 200;
export const AI_POLL_INTERVAL_MS = 2500;
export const AI_POLL_TIMEOUT_MS = 90000;

export type AiLanguage = 'AUTO' | 'VI' | 'EN';
export type AiCardStyle = 'QA' | 'TERM_DEFINITION';
export type AiGenerationStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';

export interface AiGenerateRequest {
  /** Exactly one of text / file. */
  text?: string;
  file?: File;
  numberOfCards: number;
  language: AiLanguage;
  style: AiCardStyle;
  focusTopic?: string;
  /** Student: an enrolled course. */
  courseId?: number;
}

/** API 31 */
export interface AiGenerateAccepted {
  generationId: number;
  status: AiGenerationStatus;
  reservedTokens: number;
}

export interface AiGeneratedCard {
  tempId: string;
  frontText: string;
  backText: string;
}

/** API 32 */
export interface AiGeneration {
  generationId: number;
  status: AiGenerationStatus;
  /** null while PENDING / PROCESSING, [] when FAILED. */
  cards: AiGeneratedCard[] | null;
  usage: { inputTokens: number; outputTokens: number; remainingTokens: number } | null;
  saved: boolean;
  errorCode: string | null;
  errorMessage: string | null;
}

/** API 33 */
export interface AiUsage {
  billingSource: 'SUBSCRIPTION' | 'FREE_QUOTA';
  planName: string | null;
  tokenLimit: number;
  tokenUsed: number;
  tokenReserved: number;
  tokenRemaining: number;
  periodStart: string;
  periodEnd: string;
}

export const aiFlashcardService = {
  async generate(req: AiGenerateRequest): Promise<AiGenerateAccepted> {
    const form = new FormData();
    if (req.text != null) form.append('text', req.text);
    if (req.file) form.append('file', req.file);
    form.append('numberOfCards', String(req.numberOfCards));
    form.append('language', req.language);
    form.append('style', req.style);
    if (req.focusTopic) form.append('focusTopic', req.focusTopic);
    if (req.courseId != null) form.append('courseId', String(req.courseId));
    const res = await apiClient.post<ApiResponse<AiGenerateAccepted>>('/ai/flashcards/generate', form, {
      // Let the browser/Axios add the multipart boundary.
      headers: { 'Content-Type': undefined },
      timeout: 60000,
    });
    return res.data.data;
  },

  async getGeneration(generationId: number): Promise<AiGeneration> {
    const res = await api.get<ApiResponse<AiGeneration>>(`/ai/flashcards/generations/${generationId}`);
    return res.data;
  },

  async getMyUsage(): Promise<AiUsage> {
    const res = await api.get<ApiResponse<AiUsage>>('/ai/usage/me');
    return res.data;
  },
};

// ------------------------------------------------------------- errors

const ERROR_TEXT: Record<string, string> = {
  AI_QUOTA_EXCEEDED: 'You have used all your AI tokens for this period. Upgrade your plan or wait for the next period.',
  INPUT_REQUIRED: 'Paste some text or upload a file.',
  INPUT_CONFLICT: 'Use either text or a file, not both.',
  EMPTY_CONTENT: 'There is not enough content to make flashcards from.',
  CONTENT_TOO_LONG: 'The content is too long. Shorten it and try again.',
  FILE_TOO_LARGE: 'The file is larger than 10 MB.',
  UNSUPPORTED_FILE_TYPE: 'Only PDF, Word (.docx) and text (.txt) files are supported.',
  PDF_NO_TEXT_LAYER: 'This PDF has no selectable text (it may be a scan). Use a text-based PDF.',
  RATE_LIMITED: 'You are generating too quickly. Wait a minute and try again.',
  AI_PROVIDER_ERROR: 'The AI service is unavailable right now. Your tokens were refunded — try again later.',
  AI_INVALID_OUTPUT: 'The AI returned an unusable result. Your tokens were refunded — try again.',
  AI_TIMEOUT: 'The AI took too long to answer. Your tokens were refunded — try again.',
  GENERATION_ALREADY_SAVED: 'These cards were already saved.',
  GENERATION_NOT_FOUND: 'This generation no longer exists.',
};

type ErrorBody = { message?: string; data?: { code?: string } | null; code?: string };

export function aiErrorCode(err: unknown): string | null {
  const body = (err as { response?: { data?: ErrorBody } } | null)?.response?.data;
  return body?.data?.code ?? body?.code ?? null;
}

/** Friendly text for an error code, falling back to the server message. */
export function aiErrorText(code: string | null | undefined, serverMessage: string | null | undefined, fallback: string): string {
  return (code && ERROR_TEXT[code]) || serverMessage?.trim() || fallback;
}
