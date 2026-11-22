import { api } from './api';
import type { ApiResponse } from '@/auth/authContext';
import type { PageResponse } from './course.service';
import type { Deck } from './deck.service';

export const adminCommunityDeckService = {
  async list(params: { visibility?: string; reviewStatus?: string; search?: string; page?: number; size?: number } = {}): Promise<PageResponse<Deck>> {
    const query = new URLSearchParams();
    if (params.visibility) query.set('visibility', params.visibility);
    if (params.reviewStatus) query.set('reviewStatus', params.reviewStatus);
    if (params.search) query.set('search', params.search);
    if (params.page !== undefined) query.set('page', String(params.page));
    if (params.size !== undefined) query.set('size', String(params.size));
    const qs = query.toString();
    const res = await api.get<ApiResponse<PageResponse<Deck>>>(`/admin/community-decks${qs ? `?${qs}` : ''}`);
    return res.data;
  },

  async hide(deckId: number, reason?: string): Promise<Deck> {
    const res = await api.request<ApiResponse<Deck>>({
      method: 'patch',
      url: `/admin/community-decks/${deckId}/hide`,
      data: reason ? { reason } : {},
    });
    return res.data;
  },

  async remove(deckId: number): Promise<void> {
    await api.request<ApiResponse<null>>({
      method: 'delete',
      url: `/admin/community-decks/${deckId}`,
    });
  },
};
