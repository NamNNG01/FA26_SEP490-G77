import { api } from './api';
import { apiClient } from './axios';
import type { ApiResponse } from '@/auth/authContext';
import type { PageResponse } from './course.service';

/**
 * StudentDeckService — a student's own flashcard decks and study progress.
 *
 * Endpoints (StudentDeckController):
 *   POST   /api/v1/student/decks                              (FC-01)
 *   PUT    /api/v1/student/decks/{deckId}                     (FC-02) — only the sent fields change
 *   DELETE /api/v1/student/decks/{deckId}                     (FC-03) — also deletes cards and progress
 *   POST   /api/v1/student/decks/{deckId}/cards               (FC-04)
 *   PUT    /api/v1/student/cards/{cardId}                     (FC-05)
 *   DELETE /api/v1/student/cards/{cardId}                     (FC-06)
 *   POST   /api/v1/student/decks/{deckId}/cards/import        (FC-07) — multipart, runs in the background
 *   PUT    /api/v1/student/cards/{cardId}/progress            (FC-08)
 *   PUT    /api/v1/student/decks/{deckId}/learn-all           (FC-09)
 *   POST   /api/v1/student/decks/{deckId}/publish-request     (FC-10)
 *   GET    /api/v1/student/decks/{deckId}/imports/{importId}  (FC-11)
 *   POST   /api/v1/student/decks/{deckId}/cards/from-question (FC-12)
 *   POST   /api/v1/student/decks/{deckId}/study-sessions      (FP-01)
 *   POST   /api/v1/student/study-sessions/{sessionId}/finish  (FP-02)
 *   GET    /api/v1/student/decks/{deckId}/review-cards        (FP-03)
 *   GET    /api/v1/student/decks/{deckId}/viewer              (FV-01)
 *   GET    /api/v1/student/decks?scope=MINE|COURSE            (FC-13)
 *   GET    /api/v1/student/decks/{deckId}                     (FC-14)
 *   POST   /api/v1/student/decks/{deckId}/withdraw-review     (FC-15)
 */

export type DeckMode = 'FLASHCARD' | 'CODE_SNIPPET' | 'CODE_OUTPUT';
export type DeckVisibility = 'PRIVATE' | 'PUBLIC';
export type ReviewStatus = 'NONE' | 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED';
export type CodeLanguage = 'JAVA' | 'PYTHON' | 'C' | 'CPP';
/** NEW = never opened (study responses only). */
export type CardStatus = 'NEW' | 'LEARNING' | 'KNOWN';

export const DECK_MODES: DeckMode[] = ['FLASHCARD', 'CODE_SNIPPET', 'CODE_OUTPUT'];
export const CODE_LANGUAGES: CodeLanguage[] = ['JAVA', 'PYTHON', 'C', 'CPP'];
export const DECK_TITLE_MAX = 150;
export const DECK_DESCRIPTION_MAX = 500;
export const CARD_TEXT_MAX = 5000;
export const CARD_CODE_MAX = 20000;
export const IMPORT_MAX_BYTES = 5 * 1024 * 1024;

/** DeckView — FC-01 / FC-02 (and FC-14, with the extra fields). */
export interface StudentDeckView {
  deckId: number;
  title: string;
  description: string | null;
  mode: DeckMode;
  courseId: number | null;
  cardCount: number;
  visibility: DeckVisibility;
  reviewStatus: ReviewStatus;
  /** Why the deck was rejected — only sent to the owner. */
  reviewNote: string | null;
  createdAt: string | null;
  // FC-14 only.
  courseTitle?: string | null;
  ownerName?: string | null;
  isOwner?: boolean;
  learnedCount?: number;
  starredCount?: number;
  submittedAt?: string | null;
}

/** FC-13 list item. */
export interface DeckListItem {
  deckId: number;
  title: string;
  description: string | null;
  mode: DeckMode;
  courseId: number | null;
  courseTitle: string | null;
  ownerId: number | null;
  ownerName: string | null;
  cardCount: number;
  learnedCount: number;
  starredCount: number;
  visibility: DeckVisibility;
  reviewStatus: ReviewStatus;
  createdAt: string | null;
}

export interface DeckListParams {
  scope: 'MINE' | 'COURSE';
  courseId?: number;
  search?: string;
  mode?: DeckMode;
  page?: number;
  size?: number;
}

export interface DeckCreateRequest {
  title: string;
  description?: string;
  mode: DeckMode;
  courseId?: number;
}

/** Omitted fields stay unchanged. */
export type DeckUpdateRequest = Partial<DeckCreateRequest>;

/** FC-04 / FC-05 — required fields depend on the deck mode (see CARD_FIELDS). */
export interface CardWriteRequest {
  frontText?: string;
  backText?: string;
  codeLanguage?: CodeLanguage;
  codeBody?: string;
}

export interface CardView {
  cardId: number;
  deckId: number;
  frontText: string;
  backText: string;
  codeLanguage: CodeLanguage | null;
  codeBody: string | null;
  position: number;
}

export interface PublishRequestView {
  deckId: number;
  visibility: DeckVisibility;
  reviewStatus: ReviewStatus;
  submittedAt: string | null;
}

export interface ProgressView {
  cardId: number;
  status: CardStatus;
  wrongCount: number;
  isStarred: boolean;
  deckLearned: boolean;
  learnedCount: number;
  totalCards: number;
}

export interface DeckLearnedView {
  deckId: number;
  learnedCount: number;
  totalCards: number;
  deckLearned: boolean;
}

export interface StudyCard {
  cardId: number;
  frontText: string;
  backText: string;
  codeLanguage: CodeLanguage | null;
  codeBody: string | null;
  status: CardStatus;
  wrongCount: number;
  isStarred: boolean;
}

export interface StudySessionView {
  sessionId: string;
  deckId: number;
  deckTitle: string;
  deckMode: DeckMode;
  totalCards: number;
  cards: StudyCard[];
}

export interface SessionSummary {
  totalCards: number;
  knownCount: number;
  wrongCount: number;
}

export interface ViewerCard {
  cardId: number;
  frontText: string;
  backText: string;
  codeLanguage: CodeLanguage | null;
  codeBody: string | null;
}

export interface ViewerView {
  deckId: number;
  deckTitle: string;
  deckMode: DeckMode;
  cards: ViewerCard[];
}

export type ImportStatus = 'PROCESSING' | 'COMPLETED' | 'FAILED';

export interface ImportStarted {
  importId: number;
  status: ImportStatus;
  totalRows: number;
}

export interface ImportStatusView {
  importId: number;
  status: ImportStatus;
  progress: number;
  totalRows: number;
  successCount: number;
  errorRows: { row: number; reason: string }[] | null;
}

export interface CardFromQuestionView {
  cardId: number;
  deckId: number;
  frontText: string;
  backText: string;
  position: number;
  sourceQuestionId: number;
  sourceAttemptId: number;
}

export const DECK_MODE_LABEL: Record<DeckMode, string> = {
  FLASHCARD: 'Flashcard',
  CODE_SNIPPET: 'Code snippet',
  CODE_OUTPUT: 'Code → Output',
};

export const CODE_LANGUAGE_LABEL: Record<CodeLanguage, string> = {
  JAVA: 'Java',
  PYTHON: 'Python',
  C: 'C',
  CPP: 'C++',
};

/** A deck under review or public can't be changed (docs/notes/student-flashcards-be-gaps-2026-10-29.md §4). */
export const isDeckEditable = (status: ReviewStatus) => status === 'NONE' || status === 'REJECTED';
/** Public decks can't be deleted — other students may be studying them. */
export const isDeckDeletable = (status: ReviewStatus) => status !== 'APPROVED';

/** FC-13 list item → the DeckView the deck page starts from. */
export const deckViewFromListItem = (d: DeckListItem, isOwner: boolean): StudentDeckView => ({
  deckId: d.deckId,
  title: d.title,
  description: d.description,
  mode: d.mode,
  courseId: d.courseId,
  courseTitle: d.courseTitle,
  cardCount: d.cardCount,
  visibility: d.visibility,
  reviewStatus: d.reviewStatus,
  reviewNote: null,
  createdAt: d.createdAt,
  ownerName: d.ownerName,
  isOwner,
  learnedCount: d.learnedCount,
  starredCount: d.starredCount,
});

/** Result question types FC-12 can turn into a card (the BE writes the key as the back). */
export const SAVABLE_QUESTION_TYPES: ReadonlySet<string> = new Set([
  'SINGLE_CHOICE',
  'MULTIPLE_CHOICE',
  'TRUE_FALSE',
  'ORDERING',
  'MATCHING',
  'FILL_BLANK',
]);

// ------------------------------------------------------------- errors

type ErrorBody = { message?: string; data?: { code?: string; cardId?: number } | null };
type HttpError = { response?: { status?: number; data?: ErrorBody } };

export function apiStatus(err: unknown): number | null {
  return (err as HttpError | null)?.response?.status ?? null;
}

/** `data.code` of a BE error (ALREADY_EXISTS, DECK_LOCKED, ALREADY_PENDING_REVIEW, …). */
export function apiErrorCode(err: unknown): string | null {
  return (err as HttpError | null)?.response?.data?.data?.code ?? null;
}

/** FC-12 409 ALREADY_EXISTS carries the card that already holds the question. */
export function existingCardId(err: unknown): number | null {
  return (err as HttpError | null)?.response?.data?.data?.cardId ?? null;
}

/**
 * The route itself is missing on the server: 405 (path mapped for another method)
 * or Spring's generic 404 — a real "Deck not found." has its own message.
 */
export function isEndpointMissing(err: unknown): boolean {
  const res = (err as HttpError | null)?.response;
  if (!res) return false;
  return res.status === 405 || (res.status === 404 && res.data?.message === 'Requested resource was not found');
}

// ------------------------------------------------------------- calls

export const studentDeckService = {
  /** FC-13 (older BEs answer 405 — see isEndpointMissing). */
  async listDecks(params: DeckListParams): Promise<PageResponse<DeckListItem>> {
    const query = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') query.set(key, String(value));
    });
    const res = await api.get<ApiResponse<PageResponse<DeckListItem>>>(`/student/decks?${query.toString()}`);
    if (!res.data || !Array.isArray(res.data.content)) throw new Error('Decks response is invalid.');
    return res.data;
  },

  /** Every page of FC-13 (max 100 per page). */
  async listAllDecks(params: Omit<DeckListParams, 'page' | 'size'>): Promise<DeckListItem[]> {
    const all: DeckListItem[] = [];
    for (let page = 0; ; page++) {
      const res = await studentDeckService.listDecks({ ...params, page, size: 100 });
      all.push(...res.content);
      if (res.last || res.content.length === 0 || page + 1 >= res.totalPages) return all;
    }
  },

  /** FC-14 */
  async getDeck(deckId: number | string): Promise<StudentDeckView> {
    const res = await api.get<ApiResponse<StudentDeckView>>(`/student/decks/${deckId}`);
    return res.data;
  },

  async createDeck(payload: DeckCreateRequest): Promise<StudentDeckView> {
    const res = await api.post<ApiResponse<StudentDeckView>>('/student/decks', payload);
    return res.data;
  },

  async updateDeck(deckId: number | string, payload: DeckUpdateRequest): Promise<StudentDeckView> {
    const res = await api.request<ApiResponse<StudentDeckView>>({ method: 'put', url: `/student/decks/${deckId}`, data: payload });
    return res.data;
  },

  async deleteDeck(deckId: number | string): Promise<void> {
    await api.request<ApiResponse<null>>({ method: 'delete', url: `/student/decks/${deckId}` });
  },

  async requestPublish(deckId: number | string): Promise<PublishRequestView> {
    const res = await api.post<ApiResponse<PublishRequestView>>(`/student/decks/${deckId}/publish-request`);
    return res.data;
  },

  /** FC-15 */
  async withdrawReview(deckId: number | string): Promise<PublishRequestView> {
    const res = await api.post<ApiResponse<PublishRequestView>>(`/student/decks/${deckId}/withdraw-review`);
    return res.data;
  },

  async createCard(deckId: number | string, payload: CardWriteRequest): Promise<CardView> {
    const res = await api.post<ApiResponse<CardView>>(`/student/decks/${deckId}/cards`, payload);
    return res.data;
  },

  async updateCard(cardId: number | string, payload: CardWriteRequest): Promise<CardView> {
    const res = await api.request<ApiResponse<CardView>>({ method: 'put', url: `/student/cards/${cardId}`, data: payload });
    return res.data;
  },

  async deleteCard(cardId: number | string): Promise<void> {
    await api.request<ApiResponse<null>>({ method: 'delete', url: `/student/cards/${cardId}` });
  },

  async importCards(deckId: number | string, file: File): Promise<ImportStarted> {
    const form = new FormData();
    form.append('file', file);
    const res = await apiClient.post<ApiResponse<ImportStarted>>(`/student/decks/${deckId}/cards/import`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 60000,
    });
    return res.data.data;
  },

  async getImportStatus(deckId: number | string, importId: number | string): Promise<ImportStatusView> {
    const res = await api.get<ApiResponse<ImportStatusView>>(`/student/decks/${deckId}/imports/${importId}`);
    return res.data;
  },

  async cardFromQuestion(deckId: number | string, questionId: number, attemptId: number): Promise<CardFromQuestionView> {
    const res = await api.post<ApiResponse<CardFromQuestionView>>(`/student/decks/${deckId}/cards/from-question`, { questionId, attemptId });
    return res.data;
  },

  async writeProgress(cardId: number, payload: { status?: 'LEARNING' | 'KNOWN' | 'WRONG'; isStarred?: boolean }): Promise<ProgressView> {
    const res = await api.request<ApiResponse<ProgressView>>({ method: 'put', url: `/student/cards/${cardId}/progress`, data: payload });
    return res.data;
  },

  async learnAll(deckId: number | string): Promise<DeckLearnedView> {
    const res = await api.request<ApiResponse<DeckLearnedView>>({ method: 'put', url: `/student/decks/${deckId}/learn-all` });
    return res.data;
  },

  /** cardLimit 0 = every card, in the BE's study order (new, learning, known). */
  async startSession(deckId: number | string, cardLimit = 0): Promise<StudySessionView> {
    const res = await api.post<ApiResponse<StudySessionView>>(`/student/decks/${deckId}/study-sessions`, { mode: 'LEARN', cardLimit });
    if (!res.data || !Array.isArray(res.data.cards)) throw new Error('Study session response is invalid.');
    return res.data;
  },

  async finishSession(sessionId: string, knownCardIds: number[], wrongCardIds: number[]): Promise<SessionSummary> {
    const res = await api.post<ApiResponse<SessionSummary>>(`/student/study-sessions/${sessionId}/finish`, { knownCardIds, wrongCardIds });
    return res.data;
  },

  /** LEARNING cards, most-missed first; limit 1–50. */
  async getReviewCards(deckId: number | string, limit = 50): Promise<StudyCard[]> {
    const res = await api.get<ApiResponse<StudyCard[]>>(`/student/decks/${deckId}/review-cards?limit=${limit}`);
    if (!Array.isArray(res.data)) throw new Error('Review cards response is invalid.');
    return res.data;
  },

  async getViewer(deckId: number | string): Promise<ViewerView> {
    const res = await api.get<ApiResponse<ViewerView>>(`/student/decks/${deckId}/viewer`);
    if (!res.data || !Array.isArray(res.data.cards)) throw new Error('Deck response is invalid.');
    return res.data;
  },
};
