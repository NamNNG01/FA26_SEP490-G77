import { config } from '@/config';

export const apiClient = {
  baseUrl: config.apiBaseUrl,
  async get(endpoint: string) {
    const res = await fetch(`${this.baseUrl}${endpoint}`);
    return res.json();
  },
};
