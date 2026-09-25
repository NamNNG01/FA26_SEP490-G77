import { apiClient } from './axios';

/**
 * High-level API client that wraps the authenticated Axios instance.
 *
 * The Axios instance attaches the `Authorization: Bearer <accessToken>`
 * header only on protected (authenticated) requests. Public endpoints
 * (login, register, refresh) never carry a Bearer token.
 */
export const api = {
  /**
   * GET <baseURL>/<endpoint>
   */
  async get<T>(endpoint: string): Promise<T> {
    const res = await apiClient.get(endpoint);
    return res.data;
  },

  /**
   * POST <baseURL>/<endpoint>
   */
  async post<T>(endpoint: string, body?: unknown): Promise<T> {
    const res = await apiClient.post(endpoint, body);
    return res.data;
  },

  /**
   * Raw request (use for non-standard options).
   */
  async request<T>(options: {
    method: 'get' | 'post' | 'put' | 'patch' | 'delete';
    url: string;
    data?: unknown;
  }): Promise<T> {
    const res = await apiClient.request(options);
    return res.data;
  },
};

