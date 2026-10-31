import { api } from './api';
import type { ApiResponse } from '@/auth/authContext';

export type DiscountType = 'PERCENT' | 'FIXED_AMOUNT';
export type DiscountValidity = 'ACTIVE' | 'UPCOMING' | 'EXPIRED' | 'EXHAUSTED' | 'INACTIVE';
export type AppliesTo = 'COURSE' | 'SUBSCRIPTION' | 'ALL';

export interface Discount {
  discountId: number;
  code: string;
  name: string;
  description?: string | null;
  discountType: DiscountType;
  value: number;
  maxDiscountAmount?: number | null;
  minOrderAmount?: number | null;
  appliesTo: AppliesTo;
  usageLimit: number;
  usedCount: number;
  remaining: number;
  startAt?: string | null;
  expiredAt?: string | null;
  isActive: boolean;
  validity: DiscountValidity;
  createdAt: string;
  updatedAt?: string;
  stats?: { assignedCount: number; usedCount: number; unusedAssignedCount: number; remaining: number };
  usedInContests?: { contestId: number; title: string; status: string; rankPosition: number }[];
}

export interface DiscountPayload {
  code: string;
  name: string;
  description: string;
  discountType: DiscountType;
  value: number;
  maxDiscountAmount: number | null;
  minOrderAmount: number | null;
  appliesTo: AppliesTo;
  usageLimit: number;
  startAt: string | null;
  expiredAt: string | null;
  isActive: boolean;
}

export interface DiscountAssignment {
  userDiscountId: number;
  user: { userId: number; fullName: string; email: string };
  isUsed: boolean;
  assignedAt: string;
  usedAt: string | null;
  source: { type: string; id: number; title: string } | null;
}

export interface Page<T> {
  content: T[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
  first: boolean;
  last: boolean;
}

function query(params: Record<string, string | number | boolean | undefined>) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== '') search.set(key, String(value));
  });
  return search.toString();
}

export const adminDiscountService = {
  async list(params: { keyword?: string; discountType?: string; isActive?: string; validity?: string; page: number; size: number }) {
    const res = await api.get<ApiResponse<Page<Discount>>>(`/admin/discounts?${query({ ...params, sort: 'createdAt,desc' })}`);
    return res.data;
  },
  async get(id: number) {
    const res = await api.get<ApiResponse<Discount>>(`/admin/discounts/${id}`);
    return res.data;
  },
  async create(payload: DiscountPayload) {
    const res = await api.post<ApiResponse<Discount>>('/admin/discounts', payload);
    return res.data;
  },
  async update(id: number, payload: DiscountPayload) {
    const res = await api.request<ApiResponse<Discount>>({ method: 'put', url: `/admin/discounts/${id}`, data: payload });
    return res.data;
  },
  async setStatus(id: number, isActive: boolean) {
    const res = await api.request<ApiResponse<{ discountId: number; isActive: boolean; affectedContests: { contestId: number; title: string; status: string }[] }>>({
      method: 'patch', url: `/admin/discounts/${id}/status`, data: { isActive },
    });
    return res.data;
  },
  async remove(id: number) {
    await api.request<ApiResponse<null>>({ method: 'delete', url: `/admin/discounts/${id}` });
  },
  async assignments(id: number, params: { isUsed?: string; keyword?: string; page: number; size: number }) {
    const res = await api.get<ApiResponse<Page<DiscountAssignment>>>(`/admin/discounts/${id}/assignments?${query(params)}`);
    return res.data;
  },
};
