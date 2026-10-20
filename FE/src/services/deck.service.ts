import { api } from './api';
import type { ApiResponse } from '@/auth/authContext';
import type { PageResponse } from './course.service';

/**
 * DeckService — flashcard decks a Course Manager administers.
 *
 * Endpoints (ManagerDeckController):
 *   GET    /api/v1/manager/decks       (F-01) — only decks in the caller's courses or owned by them
 *   POST   /api/v1/manager/decks       (F-02)
 *   GET    /api/v1/manager/decks/{id}  (F-03) — includes cards
 *   PUT    /api/v1/manager/decks/{id}  (F-04) — only the supplied fields change
 *   DELETE /api/v1/manager/decks/{id}  (F-05) — also deletes the deck's cards and progress
 *
 * Card endpoints — PROPOSED, not implemented by the BE yet
 * (contract in docs/notes/flashcard-deck-be-gaps.md):
 *   POST   /api/v1/manager/decks/{deckId}/cards  — createCard
 *   PUT    /api/v1/manager/cards/{cardId}        — updateCard
 *   DELETE /api/v1/manager/cards/{cardId}        — deleteCard
 * Until they exist these calls fail; isCardApiMissing() recognises that.
 */

/** DeckResponse.Card — `status` / `isStarred` are the deck owner's study progress. */
export interface DeckCard {
  cardId: number;
  frontText: string;
  backText: string;
  isStarred: boolean;
  status: string;
}

/** DeckResponse — `description` and `cards` are only sent by the detail endpoint. */
export interface Deck {
  deckId: number;
  title: string;
  courseId: number | null;
  courseName: string | null;
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
}

/** Proposed CardRequest — body of createCard / updateCard. */
export interface CardRequest {
  frontText: string;
  backText: string;
}

export const DECK_PAGE_SIZE_MAX = 100;

/**
 * True when a card call failed because the BE has no such route yet:
 * Spring answers unknown paths with 404 RESOURCE_NOT_FOUND and unsupported
 * methods with 405 — unlike a real "Card not found", which has its own message.
 */
export function isCardApiMissing(err: unknown): boolean {
  const res = (err as { response?: { status?: number; data?: { message?: string } } })?.response;
  return res?.status === 405 || (res?.status === 404 && res.data?.message === 'Requested resource was not found');
}

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

  async createCard(deckId: number | string, payload: CardRequest): Promise<DeckCard> {
    const res = await api.post<ApiResponse<DeckCard>>(`/manager/decks/${deckId}/cards`, payload);
    return res.data;
  },

  async updateCard(cardId: number | string, payload: CardRequest): Promise<DeckCard> {
    const res = await api.request<ApiResponse<DeckCard>>({ method: 'put', url: `/manager/cards/${cardId}`, data: payload });
    return res.data;
  },

  async deleteCard(cardId: number | string): Promise<void> {
    await api.request<ApiResponse<null>>({ method: 'delete', url: `/manager/cards/${cardId}` });
  },
};
