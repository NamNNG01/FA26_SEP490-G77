import { api } from './api';
import type { ApiResponse } from '@/auth/authContext';
import type { StudentPage } from './studentLearning.service';

export type StudentDiscountStatus = 'AVAILABLE' | 'USED' | 'EXPIRED' | 'REVOKED';

export interface StudentDiscount {
  userDiscountId: number;
  discountId: number;
  code: string;
  name: string;
  description: string | null;
  discountType: string;
  value: number;
  startAt: string | null;
  expiresAt: string | null;
  appliesTo: string;
  minOrderAmount: number | null;
  maxDiscountAmount: number | null;
  status: StudentDiscountStatus;
  assignedAt: string;
  usedAt: string | null;
  sourceType: string | null;
  sourceId: number | null;
}

export interface StudentDiscountDetail extends StudentDiscount {
  contestInfo: {
    contestId: number;
    title: string;
    startTime: string;
    endTime: string;
  } | null;
}

export const studentDiscountService = {
  async list(params: { status?: string; source?: string; page?: number; size?: number } = {}) {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== '') qs.set(key, String(value));
    });
    const res = await api.get<ApiResponse<StudentPage<StudentDiscount>>>(`/student/discounts?${qs}`);
    return res.data;
  },

  async get(id: number | string) {
    const res = await api.get<ApiResponse<StudentDiscountDetail>>(`/student/discounts/${id}`);
    return res.data;
  },
};
