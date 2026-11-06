import type { ApiResponse } from '@/auth/authContext';
import { apiClient } from './axios';

export type FlashcardImportFormat = 'docx' | 'xlsx';

export interface FlashcardImportError {
  code: string;
  message: string;
}

export interface FlashcardImportCard {
  /** 1-based card order, excluding the header and ignored empty rows. */
  rowIndex: number;
  /** Original 1-based table row (DOCX/XLSX) or extracted text line (PDF), for diagnostics. */
  sourceRowIndex: number;
  frontText: string;
  backText: string;
  valid: boolean;
  duplicate: boolean;
  errors: FlashcardImportError[];
}

export interface FlashcardImportPreview {
  fileName: string;
  fileType: 'DOCX' | 'XLSX' | 'PDF';
  templateVersion: string | null;
  totalRows: number;
  validCount: number;
  invalidCount: number;
  duplicateCount: number;
  cards: FlashcardImportCard[];
  warnings: FlashcardImportError[];
}

export interface FlashcardBulkRequest {
  deckId?: number;
  newDeck?: { title: string; description?: string; isPublic: boolean; courseId: number | null; /** A module of courseId; omit for none. */ moduleId?: number };
  source: 'IMPORT' | 'AI';
  /** Required when source = AI (the API 31 generationId). */
  aiGenerationId: number | null;
  skipDuplicates: boolean;
  cards: { frontText: string; backText: string }[];
}

export interface FlashcardBulkResult {
  deckId: number;
  createdCount: number;
  skippedDuplicateCount: number;
  cardIds: number[];
}

export const FLASHCARD_IMPORT_MAX_BYTES = 10 * 1024 * 1024;
export const FLASHCARD_IMPORT_MAX_ROWS = 500;
export const FLASHCARD_TEXT_MAX = 2000;

export const flashcardImportService = {
  async downloadTemplate(format: FlashcardImportFormat): Promise<{ blob: Blob; filename: string }> {
    const response = await apiClient.get(`/flashcards/import/template?format=${format}`, { responseType: 'blob' });
    const disposition = String(response.headers['content-disposition'] ?? '');
    const filename = disposition.match(/filename\*?=(?:UTF-8''|"?)([^";]+)/i)?.[1]?.replace(/"$/, '')
      ?? `flashcard-import-template-v1.${format}`;
    return { blob: response.data as Blob, filename: decodeURIComponent(filename) };
  },

  async preview(file: File, deckId?: number): Promise<FlashcardImportPreview> {
    const form = new FormData();
    form.append('file', file);
    if (deckId != null) form.append('deckId', String(deckId));
    const response = await apiClient.post<ApiResponse<FlashcardImportPreview>>('/flashcards/import/preview', form, {
      // Let the browser/Axios add the multipart boundary.
      headers: { 'Content-Type': undefined },
      timeout: 60000,
    });
    return response.data.data;
  },

  async save(payload: FlashcardBulkRequest): Promise<FlashcardBulkResult> {
    const response = await apiClient.post<ApiResponse<FlashcardBulkResult>>('/flashcards/bulk', payload);
    return response.data.data;
  },
};
