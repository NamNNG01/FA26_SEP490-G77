/**
 * 403 PLAN_FEATURE_REQUIRED — the student's plan does not unlock a capability
 * (PlanEntitlementService). The Axios interceptor rewrites the message into
 * something readable and notifies the listener mounted in the app shell, which
 * offers a link to the Subscription page.
 */
export const PLAN_FEATURE_REQUIRED = 'PLAN_FEATURE_REQUIRED';

/** Same labels as GET /api/v1/admin/subscription-plans/feature-keys. */
const FEATURE_LABELS: Record<string, string> = {
  AI_FLASHCARD_GENERATION: 'AI flashcards',
  AI_QUIZ_FROM_MATERIAL: 'AI quizzes',
  AI_ESSAY_GRADING: 'AI essay grading',
  WEAKNESS_REPORT: 'the weakness report',
  SMART_PRACTICE: 'Smart practice',
  PERSONALISED_RECOMMENDATIONS: 'personalised recommendations',
  WEAK_SPOTS: 'weak spots',
  EARLY_ACCESS: 'early access',
};

type ErrorBody = { message?: string; code?: string; data?: { code?: string; details?: { featureKey?: string } } | null };

/** The locked feature key when `error` is a PLAN_FEATURE_REQUIRED response, else null ('' when the key is missing). */
export function planFeatureRequiredKey(error: unknown): string | null {
  const response = (error as { response?: { status?: number; data?: ErrorBody } } | null)?.response;
  const body = response?.data;
  if (response?.status !== 403 || (body?.data?.code ?? body?.code) !== PLAN_FEATURE_REQUIRED) return null;
  return body?.data?.details?.featureKey ?? '';
}

export function planFeatureRequiredMessage(featureKey: string): string {
  const label = FEATURE_LABELS[featureKey];
  return label
    ? `Your plan does not include ${label}. Upgrade your plan to use it.`
    : 'Your plan does not include this feature. Upgrade your plan to use it.';
}

type Listener = (featureKey: string) => void;
const listeners = new Set<Listener>();

export function onPlanFeatureRequired(cb: Listener): () => void {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

export function emitPlanFeatureRequired(featureKey: string): void {
  listeners.forEach(cb => cb(featureKey));
}
