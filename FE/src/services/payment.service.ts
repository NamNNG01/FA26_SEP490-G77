import { api } from './api';
import type { ApiResponse } from '@/auth/authContext';
import type { PageResponse } from './course.service';

/**
 * PaymentService — PayOS payments of courses and plans (spec §17, StudentPaymentController).
 *
 *   POST   /api/v1/student/payments/checkout                     (PY-01) — { courseId } | { planId }, discountCode?; 201
 *   DELETE /api/v1/student/payments/{orderCode}                  (PY-02) — 404 unknown, 409 already SUCCEEDED
 *   GET    /api/v1/student/payments/{orderCode}/status           (PY-04) — poll every 3 s until != PENDING
 *   GET    /api/v1/student/discounts/validate?code=&courseId=|planId=   (PY-05) — valid=false + reason
 *   GET    /api/v1/student/payments/history?page=&size=          (PY-06) — newest first
 *
 * Access is only granted by the verified PayOS webhook (PY-03, GB-07): the FE never trusts the PayOS
 * return-URL query, it asks PY-04.
 *
 * Errors: PY-01 400 VALIDATION_ERROR / INVALID_DISCOUNT_CODE, 404 course or plan, 409 free item,
 * already owned or a checkout still in progress.
 */

export type PaymentType = 'COURSE' | 'SUBSCRIPTION';
export type PaymentStatus = 'PENDING' | 'SUCCEEDED' | 'FAILED' | 'EXPIRED' | 'CANCELLED';

/** What is being bought — exactly one of courseId / planId goes to PY-01 and PY-05. */
export type PaymentTarget = { courseId: number } | { planId: number };

/** PY-01 — the same data as EN-01 / SB-03. */
export interface PaymentCheckout {
  orderCode: string;
  courseId?: number | null;
  courseTitle?: string | null;
  planId?: number | null;
  planName?: string | null;
  originalPrice: number;
  discountAmount: number;
  totalPrice: number;
  paymentUrl: string;
  qrCode: string | null;
  expiresAt: string;
}

/** PY-04 */
export interface PaymentState {
  orderCode: string;
  status: PaymentStatus;
  paidAt: string | null;
  expiresAt: string | null;
}

/** PY-05 */
export interface DiscountCheck {
  valid: boolean;
  discountPercent: number | null;
  discountAmount: number | null;
  finalPrice: number | null;
  expiresAt: string | null;
  reason?: string | null;
}

/** PY-06 */
export interface PaymentHistoryItem {
  orderCode: string;
  type: PaymentType;
  refId: number;
  title: string;
  amount: number;
  status: PaymentStatus;
  createdAt: string;
  paidAt: string | null;
}

export const PAYMENT_POLL_MS = 3000;

export const isPaymentFinal = (status: PaymentStatus) => status !== 'PENDING';

export function formatVnd(amount: number | null | undefined): string {
  if (amount == null) return '—';
  return `${Number(amount).toLocaleString('vi-VN')} ₫`;
}

const targetQuery = (target: PaymentTarget) =>
  'courseId' in target ? `courseId=${target.courseId}` : `planId=${target.planId}`;

export const paymentService = {
  async checkout(target: PaymentTarget, discountCode?: string): Promise<PaymentCheckout> {
    const code = discountCode?.trim();
    const res = await api.post<ApiResponse<PaymentCheckout>>('/student/payments/checkout', {
      ...target,
      ...(code ? { discountCode: code } : {}),
    });
    return res.data;
  },

  async cancel(orderCode: string): Promise<void> {
    await api.request<ApiResponse<unknown>>({ method: 'delete', url: `/student/payments/${encodeURIComponent(orderCode)}` });
  },

  async getStatus(orderCode: string): Promise<PaymentState> {
    const res = await api.get<ApiResponse<PaymentState>>(`/student/payments/${encodeURIComponent(orderCode)}/status`);
    return res.data;
  },

  async validateDiscount(code: string, target: PaymentTarget): Promise<DiscountCheck> {
    const res = await api.get<ApiResponse<DiscountCheck>>(
      `/student/discounts/validate?code=${encodeURIComponent(code.trim())}&${targetQuery(target)}`,
    );
    return res.data;
  },

  async getHistory(page = 0, size = 10): Promise<PageResponse<PaymentHistoryItem>> {
    const res = await api.get<ApiResponse<PageResponse<PaymentHistoryItem>>>(`/student/payments/history?page=${page}&size=${size}`);
    return res.data;
  },
};

/*
 * The order a student left for the PayOS page. PayOS returns with its own numeric orderCode, which PY-04
 * does not know, so /payment/return reads the order from here (see docs/notes/payment-return-orderCode-be-gap.md).
 */
export interface PendingPayment {
  orderCode: string;
  type: PaymentType;
  refId: number;
  title: string;
}

const PENDING_KEY = 'prepexam.pendingPayment';

export function rememberPendingPayment(payment: PendingPayment) {
  try { sessionStorage.setItem(PENDING_KEY, JSON.stringify(payment)); } catch { /* storage unavailable */ }
}

export function readPendingPayment(): PendingPayment | null {
  try {
    const raw = sessionStorage.getItem(PENDING_KEY);
    return raw ? (JSON.parse(raw) as PendingPayment) : null;
  } catch {
    return null;
  }
}

export function forgetPendingPayment() {
  try { sessionStorage.removeItem(PENDING_KEY); } catch { /* storage unavailable */ }
}
