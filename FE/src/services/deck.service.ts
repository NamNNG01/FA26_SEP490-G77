import { api } from './api';
import type { ApiResponse } from '@/auth/authContext';
import type { PageResponse } from './course.service';
import { downloadFile } from '@/utils/downloadFile';

/**
 * DeckService — flashcard decks a Course Manager administers.
 *
 * Endpoints (ManagerDeckController):
 *   GET    /api/v1/manager/decks       (F-01) — only decks in the caller's courses or owned by them;
 *                                               filters: search, courseId, moduleId, isPublic
 *   POST   /api/v1/manager/decks       (F-02)
 *   GET    /api/v1/manager/decks/{id}  (F-03) — includes cards
 *   PUT    /api/v1/manager/decks/{id}  (F-04) — only the supplied fields change
 *   DELETE /api/v1/manager/decks/{id}  (F-05) — also deletes the deck's cards and progress
 *   POST   /api/v1/manager/decks/{id}/cards  (F-06) — appends a card
 *   GET    /api/v1/manager/decks/{id}/export?format=pdf — the deck as a PDF download
 *   PUT    /api/v1/manager/cards/{cardId}    (F-07) — only non-blank faces change
 *   DELETE /api/v1/manager/cards/{cardId}    (F-08) — also deletes the card's progress
 */

/** DeckResponse.Card — `status` / `isStarred` are the deck owner's study progress. */
export interface DeckCard {
  cardId: number;
  frontText: string;
  backText: string;
  frontImageUrl?: string | null;
  backImageUrl?: string | null;
  isStarred: boolean;
  status: string;
}

/** DeckResponse — `description` and `cards` are only sent by the detail endpoint. */
export interface Deck {
  deckId: number;
  title: string;
  courseId: number | null;
  courseName: string | null;
  /** The module of its course the deck is filed under; absent = none. */
  moduleId?: number | null;
  moduleTitle?: string | null;
  ownerId: number;
  ownerName: string;
  isPublic: boolean;
  cardCount: number;
  description?: string | null;
  cards?: DeckCard[];
}

export interface DeckListParams {
  search?: string;
  courseId?: number;
  /** A module of courseId. */
  moduleId?: number;
  isPublic?: boolean;
  /** 0-based. */
  page?: number;
  /** 1–100. */
  size?: number;
}

/** DeckRequests.Create — omit `courseId` for a personal deck. */
export interface DeckCreateRequest {
  title: string;
  courseId?: number;
  isPublic: boolean;
  description?: string;
  /** A module of courseId; omit for none. */
  moduleId?: number;
}

/**
 * DeckRequests.Update — omitted fields stay unchanged. A deck cannot be
 * detached from its course; an empty `description` clears it.
 */
export interface DeckUpdateRequest {
  title?: string;
  courseId?: number;
  isPublic?: boolean;
  description?: string;
  /** Omitted = unchanged (but a new courseId clears it), 0 = no module, otherwise a module of the deck's course. */
  moduleId?: number;
}

/** DeckRequests.CardCreate / CardUpdate — body of createCard / updateCard. */
export interface CardRequest {
  frontText: string | null;
  backText: string | null;
  frontImageUrl?: string | null;
  backImageUrl?: string | null;
}

/** CardResponse — what F-06 / F-07 return (no study progress). */
export interface CardResponse {
  cardId: number;
  deckId: number;
  frontText: string;
  backText: string;
  frontImageUrl?: string | null;
  backImageUrl?: string | null;
}

export const DECK_PAGE_SIZE_MAX = 100;

export const deckService = {
  async getDecks(params: DeckListParams = {}): Promise<PageResponse<Deck>> {
    const query = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') query.set(key, String(value));
    });
    const qs = query.toString();
    const res = await api.get<ApiResponse<PageResponse<Deck>>>(`/manager/decks${qs ? `?${qs}` : ''}`);
    return res.data;
  },

  /** Every deck matching the filters, fetched page by page (for export). */
  async getAllDecks(params: Omit<DeckListParams, 'page' | 'size'> = {}): Promise<Deck[]> {
    const all: Deck[] = [];
    for (let page = 0; ; page++) {
      const res = await deckService.getDecks({ ...params, page, size: DECK_PAGE_SIZE_MAX });
      all.push(...res.content);
      if (res.last || page + 1 >= res.totalPages) return all;
    }
  },

  async getDeck(id: number | string): Promise<Deck> {
    const res = await api.get<ApiResponse<Deck>>(`/manager/decks/${id}`);
    return res.data;
  },

  async createDeck(payload: DeckCreateRequest): Promise<Deck> {
    const res = await api.post<ApiResponse<Deck>>('/manager/decks', payload);
    return res.data;
  },

  async updateDeck(id: number | string, payload: DeckUpdateRequest): Promise<Deck> {
    const res = await api.request<ApiResponse<Deck>>({ method: 'put', url: `/manager/decks/${id}`, data: payload });
    return res.data;
  },

  async deleteDeck(id: number | string): Promise<void> {
    await api.request<ApiResponse<null>>({ method: 'delete', url: `/manager/decks/${id}` });
  },

  /** The deck and its cards as a PDF, saved through the browser's download. */
  async exportPdf(id: number | string, fallbackName = 'flashcards.pdf'): Promise<void> {
    await downloadFile(`/manager/decks/${id}/export?format=pdf`, fallbackName);
  },

  async createCard(deckId: number | string, payload: CardRequest): Promise<CardResponse> {
    const res = await api.post<ApiResponse<CardResponse>>(`/manager/decks/${deckId}/cards`, payload);
    return res.data;
  },

  async updateCard(cardId: number | string, payload: CardRequest): Promise<CardResponse> {
    const res = await api.request<ApiResponse<CardResponse>>({ method: 'put', url: `/manager/cards/${cardId}`, data: payload });
    return res.data;
  },

  async deleteCard(cardId: number | string): Promise<void> {
    await api.request<ApiResponse<null>>({ method: 'delete', url: `/manager/cards/${cardId}` });
  },
};
