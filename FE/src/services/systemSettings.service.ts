import { api } from './api';
import type { ApiResponse } from '@/types/api';

/**
 * AS-01 / AS-02 (admin System Settings). The screen owns the document's shape; the server
 * validates, stores and returns it verbatim, so a saved section survives a reload.
 */
export type SystemSettingsDocument = Record<string, unknown>;

export const systemSettingsService = {
  /** The stored document, or an empty object when nothing has been saved yet. */
  async get(): Promise<SystemSettingsDocument> {
    const res = await api.get<ApiResponse<SystemSettingsDocument>>('/admin/settings');
    return res.data ?? {};
  },

  /** Persists the document and returns what the server stored. */
  async save(document: SystemSettingsDocument): Promise<SystemSettingsDocument> {
    const res = await api.request<ApiResponse<SystemSettingsDocument>>({
      method: 'put',
      url: '/admin/settings',
      data: document,
    });
    return res.data ?? document;
  },
};
