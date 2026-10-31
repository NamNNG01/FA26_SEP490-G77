import { api } from './api';
import type { ApiResponse } from '@/auth/authContext';
import type { Page } from './adminDiscount.service';

/**
 * AdminSubscriptionPlanService — subscription package config.
 *
 *   GET    /api/v1/admin/subscription-plans               (API 20) — keyword, isActive, page, size; sort=sortOrder,asc
 *   GET    /api/v1/admin/subscription-plans/{id}          (API 21) — adds totalSubscribers, createdAt, updatedAt
 *   POST   /api/v1/admin/subscription-plans               (API 22) — 201
 *   PUT    /api/v1/admin/subscription-plans/{id}          (API 23)
 *   PATCH  /api/v1/admin/subscription-plans/{id}/status   (API 24) — off only hides the plan from checkout
 *   PUT    /api/v1/admin/subscription-plans/reorder       (API 25) — every non-deleted plan, sort_order = index
 *   DELETE /api/v1/admin/subscription-plans/{id}          (API 26) — soft delete
 *   GET    /api/v1/subscription-plans                     (API 27) — active plans only, no paging
 *
 * Errors: PLAN_NAME_EXISTS (409), PLAN_HAS_ACTIVE_SUBSCRIBERS (409), VALIDATION_FAILED (400).
 */

export const PLAN_NAME_MAX = 100;
/** subscription_plans.price is DECIMAL(10,2). */
export const PLAN_PRICE_MAX = 99_999_999.99;
export const PLAN_FEATURES_MAX = 20;
export const PLAN_FEATURE_TEXT_MAX = 200;

/** API 20 row */
export interface AdminSubscriptionPlan {
  planId: number;
  planName: string;
  description: string | null;
  price: number;
  currency: string;
  durationDays: number;
  /** Total tokens for the whole plan period. */
  aiTokenLimit: number;
  features: string[];
  isActive: boolean;
  sortOrder: number;
  activeSubscribers: number;
}

/** API 21 */
export interface AdminSubscriptionPlanDetail extends AdminSubscriptionPlan {
  totalSubscribers: number;
  createdAt: string;
  updatedAt: string | null;
}

/** API 22 / API 23 body */
export interface SubscriptionPlanPayload {
  planName: string;
  description: string;
  price: number;
  durationDays: number;
  aiTokenLimit: number;
  features: string[];
  isActive: boolean;
  sortOrder: number;
}

/** API 27 row */
export type PublicSubscriptionPlan = Omit<AdminSubscriptionPlan, 'activeSubscribers'>;

function query(params: Record<string, string | number | boolean | undefined>) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== '') search.set(key, String(value));
  });
  return search.toString();
}

export const adminSubscriptionPlanService = {
  async list(params: { keyword?: string; isActive?: string; page: number; size: number }) {
    const res = await api.get<ApiResponse<Page<AdminSubscriptionPlan>>>(`/admin/subscription-plans?${query({ ...params, sort: 'sortOrder,asc' })}`);
    return res.data;
  },
  /** Every non-deleted plan — API 25 needs the full list. */
  async listAll(): Promise<AdminSubscriptionPlan[]> {
    const all: AdminSubscriptionPlan[] = [];
    for (let page = 0; ; page++) {
      const res = await adminSubscriptionPlanService.list({ page, size: 100 });
      all.push(...res.content);
      if (res.last || res.content.length === 0 || page + 1 >= res.totalPages) return all;
    }
  },
  async get(id: number) {
    const res = await api.get<ApiResponse<AdminSubscriptionPlanDetail>>(`/admin/subscription-plans/${id}`);
    return res.data;
  },
  async create(payload: SubscriptionPlanPayload) {
    const res = await api.post<ApiResponse<AdminSubscriptionPlanDetail>>('/admin/subscription-plans', payload);
    return res.data;
  },
  async update(id: number, payload: SubscriptionPlanPayload) {
    const res = await api.request<ApiResponse<AdminSubscriptionPlanDetail>>({ method: 'put', url: `/admin/subscription-plans/${id}`, data: payload });
    return res.data;
  },
  async setStatus(id: number, isActive: boolean) {
    const res = await api.request<ApiResponse<{ planId: number; isActive: boolean }>>({
      method: 'patch', url: `/admin/subscription-plans/${id}/status`, data: { isActive },
    });
    return res.data;
  },
  async reorder(orderedPlanIds: number[]) {
    await api.request<ApiResponse<unknown>>({ method: 'put', url: '/admin/subscription-plans/reorder', data: { orderedPlanIds } });
  },
  async remove(id: number) {
    await api.request<ApiResponse<null>>({ method: 'delete', url: `/admin/subscription-plans/${id}` });
  },
  /** API 27 — public. */
  async listPublic(): Promise<PublicSubscriptionPlan[]> {
    const res = await api.get<ApiResponse<PublicSubscriptionPlan[]>>('/subscription-plans');
    return res.data ?? [];
  },
};
