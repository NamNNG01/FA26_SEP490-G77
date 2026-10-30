import { useEffect, useSyncExternalStore } from 'react';
import { api } from './api';
import type { ApiResponse } from '@/auth/authContext';

/**
 * StudentSubscriptionService — study plans (spec §16, StudentSubscriptionController).
 *
 *   GET   /api/v1/student/subscription/plans        (SB-01) — public; `isCurrent` needs the token
 *   GET   /api/v1/student/subscription/current      (SB-02) — `data: null` without an ACTIVE plan
 *   PATCH /api/v1/student/subscription/auto-renew   (SB-04) — ACTIVE plan only
 *
 * A plan is bought with the shared PY-01 checkout (payment.service, `{ planId }`); it turns ACTIVE
 * through the PayOS webhook. SB-03 (`/subscription/checkout`) answers the same and is not used.
 *
 * Errors: SB-04 404 no ACTIVE plan.
 */

/** SB-01 */
export interface SubscriptionPlan {
  planId: number;
  name: string;
  price: number;
  durationDays: number;
  features: string[];
  isRecommended: boolean;
  isCurrent: boolean;
}

/** SB-02 */
export interface CurrentSubscription {
  subscriptionId: number;
  planId: number;
  planName: string;
  status: string;
  price: number;
  startedAt: string;
  expiresAt: string;
  daysRemaining: number;
  autoRenew: boolean;
}

export const subscriptionService = {
  async getPlans(): Promise<SubscriptionPlan[]> {
    const res = await api.get<ApiResponse<SubscriptionPlan[]>>('/student/subscription/plans');
    return res.data ?? [];
  },

  async getCurrent(): Promise<CurrentSubscription | null> {
    const res = await api.get<ApiResponse<CurrentSubscription | null>>('/student/subscription/current');
    return res.data ?? null;
  },

  async setAutoRenew(autoRenew: boolean): Promise<{ subscriptionId: number; autoRenew: boolean }> {
    const res = await api.request<ApiResponse<{ subscriptionId: number; autoRenew: boolean }>>({
      method: 'patch',
      url: '/student/subscription/auto-renew',
      data: { autoRenew },
    });
    return res.data;
  },
};

/*
 * Current plan shared by the header badge and the Subscription page: one SB-02 call for both, and
 * refreshCurrentSubscription() after a purchase or an auto-renew change updates every reader.
 */
type CurrentState = { loaded: boolean; data: CurrentSubscription | null };

const EMPTY: CurrentState = { loaded: false, data: null };

let currentState: CurrentState = EMPTY;
/** Account the cached plan belongs to — another sign-in starts over. */
let currentOwner: number | null = null;
let inflight: Promise<void> | null = null;
const listeners = new Set<() => void>();

function setCurrent(next: CurrentState) {
  currentState = next;
  listeners.forEach(l => l());
}

export function refreshCurrentSubscription(): Promise<void> {
  if (!inflight) {
    const owner = currentOwner;
    const request: Promise<void> = subscriptionService
      .getCurrent()
      .then(data => { if (owner === currentOwner) setCurrent({ loaded: true, data }); })
      // A failed refresh keeps what is on screen.
      .catch(() => { if (owner === currentOwner) setCurrent({ loaded: true, data: currentState.data }); })
      .finally(() => { if (inflight === request) inflight = null; });
    inflight = request;
  }
  return inflight;
}

/** The signed-in student's ACTIVE plan; pass `userId = null` for guests and other roles. */
export function useCurrentSubscription(userId: number | null): CurrentState {
  const state = useSyncExternalStore(
    cb => { listeners.add(cb); return () => { listeners.delete(cb); }; },
    () => currentState,
  );
  useEffect(() => {
    if (userId == null) return;
    if (userId !== currentOwner) {
      currentOwner = userId;
      inflight = null;
      setCurrent(EMPTY);
    }
    if (!currentState.loaded) void refreshCurrentSubscription();
  }, [userId]);
  return userId != null && userId === currentOwner ? state : EMPTY;
}
