import { useEffect, useSyncExternalStore } from 'react';
import { api } from './api';
import type { ApiResponse } from '@/types/api';

/**
 * StudentSubscriptionService — study plans (spec §16, StudentSubscriptionController).
 *
 *   GET   /api/v1/student/subscription/plans        (SB-01) — public; `isCurrent` needs the token
 *   GET   /api/v1/student/subscription/current      (SB-02) — the Free Plan (`subscriptionId: null`) without a paid plan
 *
 * A plan is bought with the shared PY-01 checkout (payment.service, `{ planId }`); it turns ACTIVE
 * through the PayOS webhook. SB-03 (`/subscription/checkout`) answers the same and is not used.
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

/** SB-02 — `subscriptionId`, `startedAt` and `expiresAt` are null for the Free Plan fallback. */
export interface CurrentSubscription {
  subscriptionId: number | null;
  planId: number | null;
  planName: string;
  status: string;
  price: number;
  startedAt: string | null;
  expiresAt: string | null;
  daysRemaining: number;
}

/** A paid plan the student is subscribed to — the Free Plan fallback has no subscription row. */
export function isPaidSubscription(s: CurrentSubscription | null): s is CurrentSubscription & { subscriptionId: number; startedAt: string; expiresAt: string } {
  return !!s && s.subscriptionId != null && !!s.startedAt && !!s.expiresAt;
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
};

/*
 * Current plan shared by the header badge and the Subscription page: one SB-02 call for both, and
 * refreshCurrentSubscription() after a purchase updates every reader.
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
