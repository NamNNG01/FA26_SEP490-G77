import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router';
import { useToast } from '@/components/ui/ToastHost';
import { ROUTES } from '@/app/routes';
import { onPlanFeatureRequired, planFeatureRequiredMessage } from '@/services/planFeatureRequired';
import { refreshCurrentSubscription } from '@/services/studentSubscription.service';

/** One prompt per locked feature in this window, so pages that load several gated calls do not stack toasts. */
const REPEAT_AFTER_MS = 60_000;

/**
 * Turns a 403 PLAN_FEATURE_REQUIRED (raised by the Axios interceptor) into a toast with a
 * shortcut to the Subscription page. Mounted once for signed-in students.
 */
export function PlanFeatureRequiredPrompt() {
  const toast = useToast();
  const navigate = useNavigate();
  const lastShown = useRef(new Map<string, number>());

  useEffect(() => onPlanFeatureRequired(featureKey => {
    const now = Date.now();
    if (now - (lastShown.current.get(featureKey) ?? 0) < REPEAT_AFTER_MS) return;
    lastShown.current.set(featureKey, now);
    // The plan may have changed elsewhere (expired, or replaced) — keep the header badge honest.
    void refreshCurrentSubscription();
    toast.warning(planFeatureRequiredMessage(featureKey), {
      title: 'Upgrade required',
      action: { label: 'View plans', onClick: () => navigate(ROUTES.studentSubscription) },
      duration: 8000,
    });
  }), [navigate, toast]);

  return null;
}
